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
          ? {
              companyId,
              OR: [{ fromBatchId: batchId }, { toBatchId: batchId }],
            }
          : {
              companyId,
              OR: [{ toBatchId: batchId }, { fromBatchId: batchId }],
            },
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

    const dispatchLinks = links.filter(
      (l) =>
        l.linkType === 'batch_to_dispatch' ||
        l.linkType === 'dispatch_to_customer',
    );
    const customers = [
      ...new Set(
        dispatchLinks
          .map((l) => {
            const meta = (l.meta || {}) as { customerName?: string };
            return meta.customerName;
          })
          .filter(Boolean),
      ),
    ];

    const productionOrders = issues
      .map((i) => i.materialIssue.productionOrder?.number)
      .filter(Boolean) as string[];

    const timeline = [
      batch.goodsReceipt
        ? {
            step: 'grn',
            label: `GRN ${batch.goodsReceipt.number}`,
            at: batch.receivedAt,
          }
        : null,
      ...issues.map((i) => ({
        step: 'issue',
        label: `Issue ${i.materialIssue.number}`,
        at: i.materialIssue.createdAt,
        productionOrder: i.materialIssue.productionOrder?.number,
      })),
      ...links
        .filter((l) => l.linkType === 'production_to_fg')
        .map((l) => ({
          step: 'fg',
          label: 'Finished goods',
          at: l.createdAt,
          referenceId: l.referenceId,
        })),
      ...dispatchLinks.map((l) => {
        const meta = (l.meta || {}) as {
          customerName?: string;
          dispatchNumber?: string;
        };
        return {
          step:
            l.linkType === 'dispatch_to_customer' ? 'customer' : 'dispatch',
          label:
            l.linkType === 'dispatch_to_customer'
              ? `Customer ${meta.customerName || '—'}`
              : `Dispatch ${meta.dispatchNumber || l.referenceId}`,
          at: l.createdAt,
          customerName: meta.customerName,
        };
      }),
    ].filter(Boolean);

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
      timeline,
      chain: {
        supplierGrn: batch.goodsReceiptId,
        grnNumber: batch.goodsReceipt?.number,
        batchNumber: batch.batchNumber,
        productionOrders,
        customers,
        dispatchIds: dispatchLinks.map((l) => l.referenceId).filter(Boolean),
      },
    };
  }
}
