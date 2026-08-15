import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockEngine } from './stock.engine';
import { FifoEngine } from './fifo.engine';

@Injectable()
export class ReservationEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockEngine,
    private readonly fifo: FifoEngine,
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

    return this.prisma.$transaction(async (tx) => {
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

    return this.prisma.$transaction(async (tx) => {
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
      return tx.planningReservation.update({
        where: { id: res.id },
        data: { status: 'released' },
      });
    });
  }
}
