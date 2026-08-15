import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
  ) {}

  async listOrders(companyId: string, q: PaginationQueryDto & { status?: string }) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        include: {
          materialRequests: {
            include: { lines: { include: { material: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async getOrder(companyId: string, id: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, companyId },
      include: {
        materialRequests: {
          include: { lines: { include: { material: true } } },
        },
        issues: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return order;
  }

  private async nextProdNumber(companyId: string) {
    return this.series.next(companyId, 'production_order');
  }

  private async nextRequestNumber(companyId: string) {
    return this.series.next(companyId, 'material_request');
  }

  async createOrder(
    companyId: string,
    body: {
      number?: string;
      status?: string;
      requiredDate?: string;
      priority?: number;
      notes?: string;
    },
  ) {
    const number = body.number?.trim() || (await this.nextProdNumber(companyId));
    return this.prisma.productionOrder.create({
      data: {
        companyId,
        number,
        status: body.status || 'open',
        requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
        priority: body.priority ?? 5,
        notes: body.notes,
      },
    });
  }

  async updateOrder(
    companyId: string,
    id: string,
    body: { status?: string; notes?: string; priority?: number },
  ) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, companyId },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return this.prisma.productionOrder.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
      },
    });
  }

  async listRequests(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.materialRequest.findMany({
        where,
        include: {
          productionOrder: true,
          lines: { include: { material: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.materialRequest.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async createRequest(
    companyId: string,
    userId: string,
    body: {
      productionOrderId?: string;
      requestedBy?: string;
      notes?: string;
      lines: { materialId: string; requestedQty: number }[];
    },
  ) {
    if (!body.lines?.length) {
      throw new BadRequestException('At least one line required');
    }
    if (body.productionOrderId) {
      const po = await this.prisma.productionOrder.findFirst({
        where: { id: body.productionOrderId, companyId },
      });
      if (!po) throw new NotFoundException('Production order not found');
    }
    for (const line of body.lines) {
      if (!(line.requestedQty > 0)) {
        throw new BadRequestException('Invalid requested qty');
      }
      const mat = await this.prisma.material.findFirst({
        where: { id: line.materialId, companyId },
      });
      if (!mat) throw new BadRequestException('Material not found');
    }

    const number = await this.nextRequestNumber(companyId);
    return this.prisma.materialRequest.create({
      data: {
        companyId,
        number,
        productionOrderId: body.productionOrderId,
        requestedBy: body.requestedBy || userId,
        notes: body.notes,
        createdById: userId,
        status: 'pending',
        lines: {
          create: body.lines.map((l) => ({
            materialId: l.materialId,
            requestedQty: l.requestedQty,
          })),
        },
      },
      include: {
        productionOrder: true,
        lines: { include: { material: true } },
      },
    });
  }
}
