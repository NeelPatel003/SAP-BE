import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TraceabilityEngine {
  constructor(private readonly prisma: PrismaService) {}

  async getBatchTrace(
    companyId: string,
    batchId: string,
    direction: 'forward' | 'backward' = 'forward',
  ) {
    const batch = await this.prisma.inventoryBatch.findFirst({
      where: { id: batchId, companyId },
      include: {
        material: true,
        goodsReceipt: true,
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const links = await this.prisma.batchTraceabilityLink.findMany({
      where:
        direction === 'forward'
          ? { companyId, fromBatchId: batchId }
          : { companyId, toBatchId: batchId },
      orderBy: { createdAt: 'asc' },
    });

    const txs = await this.prisma.inventoryTransaction.findMany({
      where: { companyId, batchId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const issues = await this.prisma.materialIssueItem.findMany({
      where: { batchId, materialIssue: { companyId } },
      include: {
        materialIssue: {
          include: { productionOrder: true },
        },
      },
    });

    return {
      batch,
      direction,
      links,
      transactions: txs,
      issues: issues.map((i) => ({
        issueNumber: i.materialIssue.number,
        productionOrder: i.materialIssue.productionOrder,
        quantity: i.quantity,
      })),
      chain: {
        supplierGrn: batch.goodsReceiptId,
        grnNumber: batch.goodsReceipt?.number,
        batchNumber: batch.batchNumber,
        productionOrders: issues
          .map((i) => i.materialIssue.productionOrder?.number)
          .filter(Boolean),
      },
    };
  }
}
