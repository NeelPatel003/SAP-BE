import { Injectable } from '@nestjs/common';
import { GrnService } from '../store/grn.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grn: GrnService,
    private readonly audit: AuditService,
  ) {}

  async queue(companyId: string) {
    const items = await this.prisma.goodsReceipt.findMany({
      where: {
        companyId,
        status: { in: ['pending_qc', 'partial'] },
      },
      include: {
        supplier: true,
        purchaseOrder: true,
        items: {
          include: { material: true, batch: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return items
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.qcRequired &&
            (i.qcStatus === 'pending' || i.qcStatus === 'hold'),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }

  async inspect(
    companyId: string,
    userId: string,
    dto: {
      goodsReceiptId: string;
      inspectedBy?: string;
      notes?: string;
      items: {
        goodsReceiptItemId: string;
        result: 'accepted' | 'rejected' | 'hold' | 'deviation';
        acceptedQty: number;
        rejectedQty: number;
        deviationQty?: number;
        reworkQty?: number;
        inspectionPct?: number;
        remarks?: string;
      }[];
    },
  ) {
    const result = await this.grn.applyQc(companyId, userId, dto);

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'qc.inspection.completed',
      entityType: 'goods_receipt',
      entityId: dto.goodsReceiptId,
      meta: { number: result.number, status: result.status },
    });

    return result;
  }
}
