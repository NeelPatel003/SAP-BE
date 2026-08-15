import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveStorePolicy } from '../../../common/workflow/company-workflow';

@Injectable()
export class FifoEngine {
  constructor(private readonly prisma: PrismaService) {}

  /** Oldest batch rows with positive qty for material (+ optional warehouse / status). */
  async suggestBatches(
    companyId: string,
    materialId: string,
    quantity: number,
    warehouseId?: string,
    status: string = 'available',
  ) {
    const [company, material] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      }),
      this.prisma.material.findFirst({
        where: { id: materialId, companyId },
        select: { shelfLifeDays: true },
      }),
    ]);
    const useFefo =
      resolveStorePolicy(company?.settings).fefoEnabled &&
      material?.shelfLifeDays != null;
    const stocks = await this.prisma.inventoryStock.findMany({
      where: {
        companyId,
        materialId,
        status,
        quantity: { gt: 0 },
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { batch: true },
      orderBy: useFefo
        ? [
            { batch: { expiryDate: { sort: 'asc', nulls: 'last' } } },
            { batch: { receivedAt: 'asc' } },
          ]
        : [
            { batch: { receivedAt: 'asc' } },
            { batch: { batchNumber: 'asc' } },
          ],
    });

    const picks: {
      batchId: string;
      batchNumber: string;
      warehouseId: string;
      locationId: string | null;
      quantity: number;
      availableQty: number;
    }[] = [];

    let remaining = quantity;
    for (const s of stocks) {
      if (remaining <= 0) break;
      const take = Math.min(s.quantity, remaining);
      picks.push({
        batchId: s.batchId,
        batchNumber: s.batch.batchNumber,
        warehouseId: s.warehouseId,
        locationId: s.locationId,
        quantity: take,
        availableQty: s.quantity,
      });
      remaining -= take;
    }

    return {
      picks,
      shortfall: remaining > 0 ? remaining : 0,
      fullyCovered: remaining <= 0,
      policy: useFefo ? 'FEFO' : 'FIFO',
    };
  }

  isFifoCompliant(
    suggestedFirstBatchId: string | undefined,
    chosenBatchId: string,
  ) {
    if (!suggestedFirstBatchId) return true;
    return suggestedFirstBatchId === chosenBatchId;
  }
}
