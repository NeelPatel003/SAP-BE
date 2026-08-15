import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPendingGrn(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      readyForAccounts: true,
      accountsBookedAt: null,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        include: {
          supplier: true,
          purchaseOrder: true,
          items: { include: { material: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async markBooked(companyId: string, userId: string, id: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, companyId },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    if (!grn.readyForAccounts) {
      throw new BadRequestException('GRN is not ready for accounts');
    }
    if (grn.accountsBookedAt) {
      throw new BadRequestException('GRN already booked');
    }

    const updated = await this.prisma.goodsReceipt.update({
      where: { id },
      data: { accountsBookedAt: new Date() },
      include: {
        supplier: true,
        purchaseOrder: true,
        items: { include: { material: true } },
      },
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'accounts.grn.booked',
      entityType: 'goods_receipt',
      entityId: id,
      meta: { number: updated.number },
    });

    return updated;
  }
}
