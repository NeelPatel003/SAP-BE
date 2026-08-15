import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AgingEngine {
  constructor(private readonly prisma: PrismaService) {}

  private buckets = [30, 60, 90, 180, 365];

  async analyze(companyId: string) {
    const stocks = await this.prisma.inventoryStock.findMany({
      where: {
        companyId,
        quantity: { gt: 0 },
        status: { in: ['available', 'quality_hold', 'reserved'] },
      },
      include: {
        batch: true,
        material: { select: { id: true, code: true, name: true } },
      },
    });

    const now = Date.now();
    const aging: Record<string, number> = {
      d0_30: 0,
      d31_60: 0,
      d61_90: 0,
      d91_180: 0,
      d181_365: 0,
      d365_plus: 0,
    };

    const nearExpiry: typeof stocks = [];
    const expired: typeof stocks = [];
    const slowMoving: typeof stocks = [];

    for (const s of stocks) {
      const ageDays = Math.floor(
        (now - new Date(s.batch.receivedAt).getTime()) / 86400000,
      );
      if (ageDays <= 30) aging.d0_30 += s.quantity;
      else if (ageDays <= 60) aging.d31_60 += s.quantity;
      else if (ageDays <= 90) aging.d61_90 += s.quantity;
      else if (ageDays <= 180) aging.d91_180 += s.quantity;
      else if (ageDays <= 365) aging.d181_365 += s.quantity;
      else {
        aging.d365_plus += s.quantity;
        if (ageDays > 180) slowMoving.push(s);
      }

      if (s.batch.expiryDate) {
        const daysToExp = Math.floor(
          (new Date(s.batch.expiryDate).getTime() - now) / 86400000,
        );
        if (daysToExp < 0) expired.push(s);
        else if (daysToExp <= 30) nearExpiry.push(s);
      }
    }

    return {
      buckets: aging,
      nearExpiry: nearExpiry.slice(0, 50).map((s) => ({
        material: s.material,
        batchNumber: s.batch.batchNumber,
        expiryDate: s.batch.expiryDate,
        quantity: s.quantity,
        status: s.status,
      })),
      expired: expired.slice(0, 50).map((s) => ({
        material: s.material,
        batchNumber: s.batch.batchNumber,
        expiryDate: s.batch.expiryDate,
        quantity: s.quantity,
        status: s.status,
      })),
      slowMoving: slowMoving.slice(0, 50).map((s) => ({
        material: s.material,
        batchNumber: s.batch.batchNumber,
        receivedAt: s.batch.receivedAt,
        quantity: s.quantity,
        status: s.status,
      })),
    };
  }
}
