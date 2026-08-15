import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
  ) {}

  async listSuppliers(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? {
            OR: [
              { code: { contains: p.search, mode: 'insensitive' as const } },
              { name: { contains: p.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { qualityMetric: true },
        orderBy: { code: 'asc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async createSupplier(
    companyId: string,
    body: { code: string; name: string; email?: string; phone?: string },
  ) {
    if (!body.code?.trim() || !body.name?.trim()) {
      throw new BadRequestException('code and name are required');
    }
    return this.prisma.supplier.create({
      data: {
        companyId,
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        email: body.email,
        phone: body.phone,
      },
    });
  }

  async listOrders(
    companyId: string,
    q: PaginationQueryDto & { status?: string },
  ) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.status ? { status: q.status as PoStatus } : {}),
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          items: { include: { material: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async getOrder(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        items: { include: { material: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return {
      ...po,
      items: po.items.map((it) => ({
        ...it,
        pendingQty: Math.max(0, it.orderedQty - it.receivedQty),
      })),
    };
  }

  private async nextPoNumber(companyId: string) {
    return this.series.next(companyId, 'purchase_order');
  }

  async createOrder(
    companyId: string,
    body: {
      supplierId: string;
      number?: string;
      notes?: string;
      orderDate?: string;
      status?: 'draft' | 'open';
      lines: {
        materialId: string;
        orderedQty: number;
        unitPrice?: number;
      }[];
    },
  ) {
    if (!body.supplierId) throw new BadRequestException('supplierId required');
    if (!body.lines?.length) {
      throw new BadRequestException('At least one line required');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: body.supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    for (const line of body.lines) {
      if (!line.materialId || !(line.orderedQty > 0)) {
        throw new BadRequestException('Invalid line quantities');
      }
      const mat = await this.prisma.material.findFirst({
        where: { id: line.materialId, companyId },
      });
      if (!mat) throw new BadRequestException('Material not found for company');
    }

    const number = body.number?.trim() || (await this.nextPoNumber(companyId));
    const status: PoStatus =
      body.status === 'open' ? PoStatus.open : PoStatus.draft;

    return this.prisma.purchaseOrder.create({
      data: {
        companyId,
        supplierId: body.supplierId,
        number,
        status,
        orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
        notes: body.notes,
        items: {
          create: body.lines.map((l) => ({
            materialId: l.materialId,
            orderedQty: l.orderedQty,
            unitPrice: l.unitPrice ?? null,
          })),
        },
      },
      include: {
        supplier: true,
        items: { include: { material: true } },
      },
    });
  }

  async updateOrder(
    companyId: string,
    id: string,
    body: {
      notes?: string;
      status?: 'draft' | 'open' | 'cancelled';
      lines?: {
        materialId: string;
        orderedQty: number;
        unitPrice?: number;
      }[];
    },
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (body.status === 'cancelled') {
      if (po.items.some((i) => i.receivedQty > 0)) {
        throw new BadRequestException('Cannot cancel PO with receipts');
      }
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: PoStatus.cancelled, notes: body.notes ?? po.notes },
        include: {
          supplier: true,
          items: { include: { material: true } },
        },
      });
    }

    if (po.status === PoStatus.closed || po.status === PoStatus.cancelled) {
      throw new BadRequestException('PO is closed or cancelled');
    }

    if (body.lines && po.items.some((i) => i.receivedQty > 0)) {
      throw new BadRequestException('Cannot replace lines after GRN received');
    }

    return this.prisma.$transaction(async (tx) => {
      if (body.lines) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
        await tx.purchaseOrderItem.createMany({
          data: body.lines.map((l) => ({
            purchaseOrderId: id,
            materialId: l.materialId,
            orderedQty: l.orderedQty,
            unitPrice: l.unitPrice ?? null,
          })),
        });
      }

      let status = po.status;
      if (body.status === 'open' && po.status === PoStatus.draft) {
        status = PoStatus.open;
      } else if (body.status === 'draft' && po.status === PoStatus.draft) {
        status = PoStatus.draft;
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          notes: body.notes ?? po.notes,
          status,
        },
        include: {
          supplier: true,
          items: { include: { material: true } },
        },
      });
    });
  }
}
