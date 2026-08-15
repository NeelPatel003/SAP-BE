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
import { BatchEngine } from '../store/engines/batch.engine';
import { StockEngine } from '../store/engines/stock.engine';
import { FifoEngine } from '../store/engines/fifo.engine';
import { ReservationEngine } from '../store/engines/reservation.engine';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
    private readonly batches: BatchEngine,
    private readonly stock: StockEngine,
    private readonly fifo: FifoEngine,
    private readonly reservations: ReservationEngine,
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
    const request = await this.prisma.materialRequest.create({
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

    let poPriority: number | undefined;
    let poRequiredDate: Date | null | undefined;
    if (body.productionOrderId) {
      const po = await this.prisma.productionOrder.findFirst({
        where: { id: body.productionOrderId, companyId },
      });
      poPriority = po?.priority;
      poRequiredDate = po?.requiredDate;
    }

    for (const line of request.lines) {
      const suggestion = await this.fifo.suggestBatches(
        companyId,
        line.materialId,
        line.requestedQty,
      );
      if (!suggestion.fullyCovered) continue;
      for (const pick of suggestion.picks) {
        await this.reservations.create({
          companyId,
          materialId: line.materialId,
          quantity: pick.quantity,
          productionOrderId: body.productionOrderId,
          batchId: pick.batchId,
          warehouseId: pick.warehouseId,
          priority: poPriority,
          productionDate: poRequiredDate ?? undefined,
          notes: `Auto-reserved for ${request.number}`,
        });
      }
    }

    return request;
  }

  /**
   * Receive finished goods from a production order into available stock
   * and link issue→production→FG→dispatch chain via production_to_fg.
   */
  async receiveFg(
    companyId: string,
    userId: string,
    body: {
      productionOrderId: string;
      materialId: string;
      warehouseId: string;
      quantity: number;
      locationId?: string;
      expiryDate?: string;
    },
  ) {
    if (!(body.quantity > 0)) {
      throw new BadRequestException('quantity must be positive');
    }
    const [po, material] = await Promise.all([
      this.prisma.productionOrder.findFirst({
        where: { id: body.productionOrderId, companyId },
      }),
      this.prisma.material.findFirst({
        where: { id: body.materialId, companyId },
      }),
    ]);
    if (!po) throw new NotFoundException('Production order not found');
    if (!material) throw new NotFoundException('Material not found');

    return this.prisma.$transaction(async (tx) => {
      const batchNumber = await this.batches.nextBatchNumber(companyId, undefined, tx);
      const barcode = this.batches.barcodePayload(batchNumber, material.code);
      const batch = await tx.inventoryBatch.create({
        data: {
          companyId,
          materialId: material.id,
          batchNumber,
          barcode,
          qrPayload: barcode,
          receivedAt: new Date(),
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        },
      });

      await this.stock.add(
        {
          companyId,
          materialId: material.id,
          batchId: batch.id,
          warehouseId: body.warehouseId,
          locationId: body.locationId,
          status: 'available',
        },
        body.quantity,
        {
          transactionType: 'fg_receipt',
          referenceType: 'production_order',
          referenceId: po.id,
          createdById: userId,
        },
        tx,
      );

      await tx.batchTraceabilityLink.create({
        data: {
          companyId,
          linkType: 'production_to_fg',
          toBatchId: batch.id,
          referenceType: 'production_order',
          referenceId: po.id,
          meta: { quantity: body.quantity, materialId: material.id },
        },
      });

      return tx.inventoryBatch.findUnique({
        where: { id: batch.id },
        include: { material: true, stocks: true },
      });
    });
  }
}
