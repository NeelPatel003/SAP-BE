import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockEngine } from './stock.engine';
import { FifoEngine } from './fifo.engine';

import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ReservationEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockEngine,
    private readonly fifo: FifoEngine,
    private readonly audit: AuditService,
  ) {}

  async create(params: {
    companyId: string;
    materialId: string;
    quantity: number;
    productionOrderId?: string;
    productionDate?: Date;
    priority?: number;
    notes?: string;
    batchId?: string;
    warehouseId?: string;
  }) {
    if (params.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const material = await this.prisma.material.findFirst({
      where: { id: params.materialId, companyId: params.companyId },
    });
    if (!material) throw new NotFoundException('Material not found');

    let batchId = params.batchId;
    let warehouseId = params.warehouseId;
    let locationId: string | null = null;

    if (!batchId) {
      const suggestion = await this.fifo.suggestBatches(
        params.companyId,
        params.materialId,
        params.quantity,
        warehouseId,
      );
      if (!suggestion.fullyCovered || !suggestion.picks[0]) {
        throw new BadRequestException('Insufficient available stock to reserve');
      }
      batchId = suggestion.picks[0].batchId;
      warehouseId = suggestion.picks[0].warehouseId;
      locationId = suggestion.picks[0].locationId;
    } else {
      const stock = await this.prisma.inventoryStock.findFirst({
        where: {
          companyId: params.companyId,
          materialId: params.materialId,
          batchId,
          status: 'available',
          quantity: { gte: params.quantity },
          ...(warehouseId ? { warehouseId } : {}),
        },
      });
      if (!stock) {
        throw new BadRequestException('Insufficient available stock on batch');
      }
      warehouseId = stock.warehouseId;
      locationId = stock.locationId;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.stock.move(
        {
          companyId: params.companyId,
          materialId: params.materialId,
          batchId: batchId!,
          warehouseId: warehouseId!,
          locationId,
          status: 'available',
        },
        { warehouseId: warehouseId!, locationId, status: 'reserved' },
        params.quantity,
        {
          outType: 'reserve_out',
          inType: 'reserve_in',
          referenceType: 'planning_reservation',
        },
        tx,
      );

      return tx.planningReservation.create({
        data: {
          companyId: params.companyId,
          materialId: params.materialId,
          batchId,
          productionOrderId: params.productionOrderId,
          quantity: params.quantity,
          productionDate: params.productionDate,
          priority: params.priority ?? 5,
          notes: params.notes,
          status: 'active',
        },
      });
    });

    await this.audit.writeActivity({
      companyId: params.companyId,
      action: 'store.reservation.created',
      entityType: 'planning_reservation',
      entityId: created.id,
      meta: {
        materialId: params.materialId,
        quantity: params.quantity,
        productionOrderId: params.productionOrderId,
      },
    });

    return created;
  }

  async release(companyId: string, id: string) {
    const res = await this.prisma.planningReservation.findFirst({
      where: { id, companyId, status: 'active' },
    });
    if (!res || !res.batchId) {
      throw new NotFoundException('Active reservation not found');
    }

    const stock = await this.prisma.inventoryStock.findFirst({
      where: {
        companyId,
        materialId: res.materialId,
        batchId: res.batchId,
        status: 'reserved',
        quantity: { gte: res.quantity },
      },
    });
    if (!stock) {
      throw new BadRequestException('Reserved stock not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stock.move(
        {
          companyId,
          materialId: res.materialId,
          batchId: res.batchId!,
          warehouseId: stock.warehouseId,
          locationId: stock.locationId,
          status: 'reserved',
        },
        {
          warehouseId: stock.warehouseId,
          locationId: stock.locationId,
          status: 'available',
        },
        res.quantity,
        {
          outType: 'unreserve_out',
          inType: 'unreserve_in',
          referenceType: 'planning_reservation',
          referenceId: res.id,
        },
        tx,
      );
      await tx.planningReservation.update({
        where: { id: res.id },
        data: { status: 'released' },
      });
    });

    await this.audit.writeActivity({
      companyId,
      action: 'store.reservation.released',
      entityType: 'planning_reservation',
      entityId: res.id,
      meta: { materialId: res.materialId, quantity: res.quantity },
    });

    return { id: res.id, status: 'released' };
  }

  /**
   * Consume reserved stock for an issue line.
   * Deducts from `reserved` and marks matching active reservation(s) consumed/reduced.
   */
  async consumeForIssue(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    params: {
      companyId: string;
      materialId: string;
      batchId: string;
      warehouseId: string;
      locationId: string | null;
      quantity: number;
      productionOrderId?: string | null;
      createdById: string;
      referenceId: string;
    },
  ) {
    const reserved = await tx.inventoryStock.findFirst({
      where: {
        companyId: params.companyId,
        materialId: params.materialId,
        batchId: params.batchId,
        warehouseId: params.warehouseId,
        status: 'reserved',
        quantity: { gte: params.quantity },
        ...(params.locationId ? { locationId: params.locationId } : {}),
      },
    });
    if (!reserved) {
      throw new BadRequestException(
        'Insufficient reserved stock for issue against reservation',
      );
    }

    await this.stock.deduct(
      {
        companyId: params.companyId,
        materialId: params.materialId,
        batchId: params.batchId,
        warehouseId: params.warehouseId,
        locationId: reserved.locationId,
        status: 'reserved',
      },
      params.quantity,
      {
        transactionType: 'issue',
        referenceType: 'material_issue',
        referenceId: params.referenceId,
        createdById: params.createdById,
      },
      tx,
    );

    const reservations = await tx.planningReservation.findMany({
      where: {
        companyId: params.companyId,
        materialId: params.materialId,
        status: 'active',
        ...(params.productionOrderId
          ? { productionOrderId: params.productionOrderId }
          : {}),
        OR: [{ batchId: params.batchId }, { batchId: null }],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    let remaining = params.quantity;
    for (const r of reservations) {
      if (remaining <= 0) break;
      if (r.quantity <= remaining) {
        remaining -= r.quantity;
        await tx.planningReservation.update({
          where: { id: r.id },
          data: { status: 'consumed' },
        });
      } else {
        await tx.planningReservation.update({
          where: { id: r.id },
          data: { quantity: r.quantity - remaining },
        });
        remaining = 0;
      }
    }

    return { consumedFromReserved: true };
  }
}
