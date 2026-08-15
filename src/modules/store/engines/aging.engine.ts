import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveStorePolicy } from '../../../common/workflow/company-workflow';

function mapStockRow(s: {
  material: { id: string; code: string; name: string };
  batch: { batchNumber: string; receivedAt: Date; expiryDate: Date | null };
  quantity: number;
  status: string;
}) {
  return {
    material: s.material,
    batchNumber: s.batch.batchNumber,
    receivedAt: s.batch.receivedAt,
    expiryDate: s.batch.expiryDate,
    quantity: s.quantity,
    status: s.status,
  };
}

@Injectable()
export class AgingEngine {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(companyId: string) {
    const [company, stocks] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      }),
      this.prisma.inventoryStock.findMany({
        where: {
          companyId,
          quantity: { gt: 0 },
          status: { in: ['available', 'quality_hold', 'reserved'] },
        },
        include: {
          batch: true,
          material: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);
    const policy = resolveStorePolicy(company?.settings);

    const now = Date.now();
    const aging: Record<string, number> = {};
    const finalBand = policy.agingBands[policy.agingBands.length - 1];
    let lower = 0;
    for (const upper of policy.agingBands) {
      aging[`d${lower}_${upper}`] = 0;
      lower = upper + 1;
    }
    aging[`d${finalBand + 1}_plus`] = 0;

    const nearExpiry: typeof stocks = [];
    const expired: typeof stocks = [];
    const slowMoving: typeof stocks = [];
    const deadStock: typeof stocks = [];

    for (const s of stocks) {
      const ageDays = Math.floor(
        (now - new Date(s.batch.receivedAt).getTime()) / 86400000,
      );
      const index = policy.agingBands.findIndex((upper) => ageDays <= upper);
      if (index >= 0) {
        const lowerBound = index === 0 ? 0 : policy.agingBands[index - 1] + 1;
        aging[`d${lowerBound}_${policy.agingBands[index]}`] += s.quantity;
      } else {
        aging[`d${finalBand + 1}_plus`] += s.quantity;
      }

      if (ageDays >= policy.deadStockDays) {
        deadStock.push(s);
      } else if (ageDays >= policy.slowStockDays) {
        slowMoving.push(s);
      }

      if (s.batch.expiryDate) {
        const daysToExp = Math.floor(
          (new Date(s.batch.expiryDate).getTime() - now) / 86400000,
        );
        if (daysToExp < 0) expired.push(s);
        else if (daysToExp <= policy.nearExpiryDays) nearExpiry.push(s);
      }
    }

    return {
      buckets: aging,
      policy,
      nearExpiry: nearExpiry.slice(0, 50).map(mapStockRow),
      expired: expired.slice(0, 50).map(mapStockRow),
      slowMoving: slowMoving.slice(0, 50).map(mapStockRow),
      deadStock: deadStock.slice(0, 50).map(mapStockRow),
    };
  }
}
