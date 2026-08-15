import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export type StockKey = {
  companyId: string;
  materialId: string;
  batchId: string;
  warehouseId: string;
  locationId?: string | null;
  status: string;
};

@Injectable()
export class StockEngine {
  constructor(private readonly prisma: PrismaService) {}

  async getQty(key: StockKey, tx?: Tx) {
    const db = tx || this.prisma;
    const row = await db.inventoryStock.findFirst({
      where: {
        companyId: key.companyId,
        materialId: key.materialId,
        batchId: key.batchId,
        warehouseId: key.warehouseId,
        locationId: key.locationId ?? null,
        status: key.status,
      },
    });
    return row?.quantity ?? 0;
  }

  async add(
    key: StockKey,
    quantity: number,
    meta: {
      transactionType: string;
      referenceType?: string;
      referenceId?: string;
      notes?: string;
      createdById?: string;
    },
    tx?: Tx,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }
    const run = async (client: Tx) => {
      const existing = await client.inventoryStock.findFirst({
        where: {
          companyId: key.companyId,
          materialId: key.materialId,
          batchId: key.batchId,
          warehouseId: key.warehouseId,
          locationId: key.locationId ?? null,
          status: key.status,
        },
      });

      let balanceAfter: number;
      if (existing) {
        const updated = await client.inventoryStock.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
        });
        balanceAfter = updated.quantity;
      } else {
        const created = await client.inventoryStock.create({
          data: {
            companyId: key.companyId,
            materialId: key.materialId,
            batchId: key.batchId,
            warehouseId: key.warehouseId,
            locationId: key.locationId ?? null,
            status: key.status,
            quantity,
          },
        });
        balanceAfter = created.quantity;
      }

      await client.inventoryTransaction.create({
        data: {
          companyId: key.companyId,
          materialId: key.materialId,
          batchId: key.batchId,
          warehouseId: key.warehouseId,
          locationId: key.locationId ?? null,
          transactionType: meta.transactionType,
          status: key.status,
          quantity,
          balanceAfter,
          referenceType: meta.referenceType,
          referenceId: meta.referenceId,
          notes: meta.notes,
          createdById: meta.createdById,
        },
      });

      return balanceAfter;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  async deduct(
    key: StockKey,
    quantity: number,
    meta: {
      transactionType: string;
      referenceType?: string;
      referenceId?: string;
      notes?: string;
      createdById?: string;
    },
    tx?: Tx,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }
    const run = async (client: Tx) => {
      const existing = await client.inventoryStock.findFirst({
        where: {
          companyId: key.companyId,
          materialId: key.materialId,
          batchId: key.batchId,
          warehouseId: key.warehouseId,
          locationId: key.locationId ?? null,
          status: key.status,
        },
      });

      if (!existing || existing.quantity < quantity) {
        throw new BadRequestException(
          `Insufficient ${key.status} stock (need ${quantity}, have ${existing?.quantity ?? 0})`,
        );
      }

      const updated = await client.inventoryStock.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity - quantity },
      });

      await client.inventoryTransaction.create({
        data: {
          companyId: key.companyId,
          materialId: key.materialId,
          batchId: key.batchId,
          warehouseId: key.warehouseId,
          locationId: key.locationId ?? null,
          transactionType: meta.transactionType,
          status: key.status,
          quantity: -quantity,
          balanceAfter: updated.quantity,
          referenceType: meta.referenceType,
          referenceId: meta.referenceId,
          notes: meta.notes,
          createdById: meta.createdById,
        },
      });

      return updated.quantity;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  async move(
    from: StockKey,
    to: Omit<StockKey, 'companyId' | 'materialId' | 'batchId'> &
      Partial<Pick<StockKey, 'companyId' | 'materialId' | 'batchId'>>,
    quantity: number,
    meta: {
      outType: string;
      inType: string;
      referenceType?: string;
      referenceId?: string;
      createdById?: string;
    },
    tx?: Tx,
  ) {
    const run = async (client: Tx) => {
      await this.deduct(
        from,
        quantity,
        {
          transactionType: meta.outType,
          referenceType: meta.referenceType,
          referenceId: meta.referenceId,
          createdById: meta.createdById,
        },
        client,
      );
      await this.add(
        {
          companyId: to.companyId || from.companyId,
          materialId: to.materialId || from.materialId,
          batchId: to.batchId || from.batchId,
          warehouseId: to.warehouseId,
          locationId: to.locationId ?? null,
          status: to.status,
        },
        quantity,
        {
          transactionType: meta.inType,
          referenceType: meta.referenceType,
          referenceId: meta.referenceId,
          createdById: meta.createdById,
        },
        client,
      );
    };
    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  async sumByStatus(companyId: string, status: string) {
    const agg = await this.prisma.inventoryStock.aggregate({
      where: { companyId, status, quantity: { gt: 0 } },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }
}
