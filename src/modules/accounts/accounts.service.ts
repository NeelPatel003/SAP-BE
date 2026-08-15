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
          supplierInvoiceRecord: true,
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

  async listInvoices(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? {
            invoiceNumber: {
              contains: p.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where,
        include: {
          goodsReceipts: { select: { id: true, number: true } },
          bookings: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async attachInvoice(
    companyId: string,
    userId: string,
    body: {
      invoiceNumber: string;
      amount: number;
      taxAmount?: number;
      goodsReceiptIds: string[];
      attachmentUrl?: string;
    },
  ) {
    if (!body.goodsReceiptIds?.length) {
      throw new BadRequestException('At least one GRN required');
    }
    if (!(body.amount > 0)) {
      throw new BadRequestException('amount must be positive');
    }

    const grns = await this.prisma.goodsReceipt.findMany({
      where: {
        companyId,
        id: { in: body.goodsReceiptIds },
        readyForAccounts: true,
      },
    });
    if (grns.length !== body.goodsReceiptIds.length) {
      throw new BadRequestException('One or more GRNs are not ready for accounts');
    }

    const invoice = await this.prisma.supplierInvoice.create({
      data: {
        companyId,
        invoiceNumber: body.invoiceNumber.trim(),
        amount: body.amount,
        taxAmount: body.taxAmount ?? 0,
        verificationStatus: 'pending',
        attachmentUrl: body.attachmentUrl,
        goodsReceipts: {
          connect: body.goodsReceiptIds.map((id) => ({ id })),
        },
      },
      include: { goodsReceipts: true },
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'accounts.invoice.attached',
      entityType: 'supplier_invoice',
      entityId: invoice.id,
      meta: { invoiceNumber: invoice.invoiceNumber },
    });

    return invoice;
  }

  async verifyInvoice(companyId: string, userId: string, id: string) {
    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { id, companyId },
      include: { goodsReceipts: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.verificationStatus === 'verified') {
      throw new BadRequestException('Already verified');
    }

    const updated = await this.prisma.supplierInvoice.update({
      where: { id },
      data: {
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedById: userId,
      },
      include: { goodsReceipts: true, bookings: true },
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'accounts.invoice.verified',
      entityType: 'supplier_invoice',
      entityId: id,
      meta: { invoiceNumber: updated.invoiceNumber },
    });

    return updated;
  }

  async bookPurchase(
    companyId: string,
    userId: string,
    body: {
      supplierInvoiceId: string;
      debitLines?: { account: string; amount: number }[];
      creditLines?: { account: string; amount: number }[];
    },
  ) {
    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { id: body.supplierInvoiceId, companyId },
      include: { goodsReceipts: true, bookings: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.verificationStatus !== 'verified') {
      throw new BadRequestException('Invoice must be verified before booking');
    }
    if (invoice.bookings.length) {
      throw new BadRequestException('Purchase already booked for this invoice');
    }

    const total = invoice.amount + invoice.taxAmount;
    const debitLines = body.debitLines?.length
      ? body.debitLines
      : [
          { account: 'Inventory', amount: invoice.amount },
          { account: 'Input GST', amount: invoice.taxAmount },
        ].filter((l) => l.amount > 0);
    const creditLines = body.creditLines?.length
      ? body.creditLines
      : [{ account: 'Accounts Payable', amount: total }];

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accountsBooking.create({
        data: {
          companyId,
          supplierInvoiceId: invoice.id,
          status: 'booked',
          debitLines,
          creditLines,
          bookedById: userId,
        },
      });

      await tx.goodsReceipt.updateMany({
        where: {
          companyId,
          id: { in: invoice.goodsReceipts.map((g) => g.id) },
        },
        data: { accountsBookedAt: new Date() },
      });

      return created;
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'accounts.purchase.booked',
      entityType: 'accounts_booking',
      entityId: booking.id,
      meta: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    });

    return this.prisma.accountsBooking.findUnique({
      where: { id: booking.id },
      include: {
        supplierInvoice: { include: { goodsReceipts: true } },
      },
    });
  }

  /** Legacy one-click book without invoice document. */
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
