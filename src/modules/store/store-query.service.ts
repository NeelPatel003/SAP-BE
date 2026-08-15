import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockEngine } from './engines/stock.engine';
import { AgingEngine } from './engines/aging.engine';
import { paginateParams, paginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';

@Injectable()
export class StoreQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockEngine,
    private readonly agingEngine: AgingEngine,
  ) {}

  async dashboard(companyId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [
      available,
      reserved,
      qualityHold,
      rejected,
      pendingQc,
      pendingIssueRequests,
      belowMin,
      aging,
      inwardToday,
      outwardToday,
    ] = await Promise.all([
      this.stock.sumByStatus(companyId, 'available'),
      this.stock.sumByStatus(companyId, 'reserved'),
      this.stock.sumByStatus(companyId, 'quality_hold'),
      this.stock.sumByStatus(companyId, 'rejected'),
      this.prisma.goodsReceipt.count({
        where: { companyId, status: 'pending_qc' },
      }),
      this.prisma.planningReservation.count({
        where: { companyId, status: 'active' },
      }),
      this.prisma.$queryRawUnsafe<
        { id: string; code: string; name: string; qty: number; min_stock: number }[]
      >(
        `SELECT m.id, m.code, m.name,
                COALESCE(SUM(s.quantity) FILTER (WHERE s.status = 'available'), 0)::float AS qty,
                m.min_stock
         FROM materials m
         LEFT JOIN inventory_stock s ON s.material_id = m.id AND s.company_id = m.company_id
         WHERE m.company_id = $1
         GROUP BY m.id
         HAVING COALESCE(SUM(s.quantity) FILTER (WHERE s.status = 'available'), 0) < m.min_stock
            AND m.min_stock > 0
         LIMIT 20`,
        companyId,
      ),
      this.agingEngine.analyze(companyId),
      this.prisma.inventoryTransaction.aggregate({
        where: {
          companyId,
          createdAt: { gte: start },
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryTransaction.aggregate({
        where: {
          companyId,
          createdAt: { gte: start },
          quantity: { lt: 0 },
        },
        _sum: { quantity: true },
      }),
    ]);

    return {
      availableStock: available,
      reservedStock: reserved,
      qualityHoldStock: qualityHold,
      rejectedStock: rejected,
      pendingQc,
      pendingReservations: pendingIssueRequests,
      inwardToday: inwardToday._sum.quantity ?? 0,
      outwardToday: Math.abs(outwardToday._sum.quantity ?? 0),
      stockBelowMinimum: belowMin,
      nearExpiry: aging.nearExpiry,
      expired: aging.expired,
      slowMoving: aging.slowMoving,
      agingBuckets: aging.buckets,
    };
  }

  async listStock(
    companyId: string,
    q: PaginationQueryDto & {
      status?: string;
      warehouseId?: string;
      materialId?: string;
    },
  ) {
    const p = paginateParams(q);
    const where = {
      companyId,
      quantity: { gt: 0 },
      ...(q.status ? { status: q.status } : {}),
      ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
      ...(q.materialId ? { materialId: q.materialId } : {}),
      ...(p.search
        ? {
            OR: [
              {
                material: {
                  code: { contains: p.search, mode: 'insensitive' as const },
                },
              },
              {
                material: {
                  name: { contains: p.search, mode: 'insensitive' as const },
                },
              },
              {
                batch: {
                  batchNumber: {
                    contains: p.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.inventoryStock.findMany({
        where,
        include: {
          material: true,
          batch: true,
          warehouse: true,
          location: true,
        },
        orderBy: [{ materialId: 'asc' }, { status: 'asc' }],
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.inventoryStock.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async ledger(
    companyId: string,
    q: PaginationQueryDto & { materialId?: string; batchId?: string },
  ) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.materialId ? { materialId: q.materialId } : {}),
      ...(q.batchId ? { batchId: q.batchId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: {
          material: true,
          batch: true,
          warehouse: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async getAging(companyId: string) {
    return this.agingEngine.analyze(companyId);
  }

  ledgerCsv(rows: { createdAt: Date; transactionType: string; quantity: number; material?: { code: string }; batch?: { batchNumber: string } | null }[]) {
    const header = 'date,type,material,batch,quantity\n';
    const body = rows
      .map(
        (r) =>
          `${r.createdAt.toISOString()},${r.transactionType},${r.material?.code || ''},${r.batch?.batchNumber || ''},${r.quantity}`,
      )
      .join('\n');
    return header + body;
  }

  async stockCsv(companyId: string) {
    const rows = await this.prisma.inventoryStock.findMany({
      where: { companyId, quantity: { gt: 0 } },
      include: {
        material: true,
        batch: true,
        warehouse: true,
        location: true,
      },
      orderBy: [{ materialId: 'asc' }],
      take: 5000,
    });
    const header =
      'material,name,batch,warehouse,location,status,quantity\n';
    const body = rows
      .map(
        (r) =>
          `${r.material?.code || ''},${JSON.stringify(r.material?.name || '')},${r.batch?.batchNumber || ''},${r.warehouse?.code || ''},${r.location?.code || ''},${r.status},${r.quantity}`,
      )
      .join('\n');
    return header + body;
  }

  async grnRegisterCsv(companyId: string) {
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { companyId },
      include: { supplier: true, purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const header =
      'number,status,supplier,po,receive_date,invoice,vehicle\n';
    const body = rows
      .map(
        (r) =>
          `${r.number},${r.status},${JSON.stringify(r.supplier?.name || '')},${r.purchaseOrder?.number || ''},${r.receiveDate.toISOString()},${r.supplierInvoice || ''},${r.vehicleNumber || ''}`,
      )
      .join('\n');
    return header + body;
  }

  async issueRegisterCsv(companyId: string) {
    const rows = await this.prisma.materialIssue.findMany({
      where: { companyId },
      include: {
        productionOrder: true,
        items: { include: { material: true, batch: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const header =
      'issue,production_order,material,batch,quantity,issue_date\n';
    const lines: string[] = [];
    for (const r of rows) {
      if (!r.items.length) {
        lines.push(
          `${r.number},${r.productionOrder?.number || ''},,,,${r.issueDate.toISOString()}`,
        );
      } else {
        for (const it of r.items) {
          lines.push(
            `${r.number},${r.productionOrder?.number || ''},${it.material?.code || ''},${it.batch?.batchNumber || ''},${it.quantity},${r.issueDate.toISOString()}`,
          );
        }
      }
    }
    return header + lines.join('\n');
  }

  async valuationCsv(companyId: string) {
    const stock = await this.prisma.inventoryStock.findMany({
      where: { companyId, quantity: { gt: 0 }, status: 'available' },
      include: {
        material: true,
        batch: true,
        warehouse: true,
      },
      take: 5000,
    });

    const poPrices = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { companyId } },
      select: {
        materialId: true,
        unitPrice: true,
      },
      take: 10000,
    });
    const priceByMaterial = new Map<string, number>();
    for (const p of poPrices) {
      if (p.unitPrice != null && !priceByMaterial.has(p.materialId)) {
        priceByMaterial.set(p.materialId, p.unitPrice);
      }
    }

    const header =
      'material,name,batch,barcode,warehouse,qty,unit_price,value\n';
    const body = stock
      .map((r) => {
        const unit = priceByMaterial.get(r.materialId) ?? 0;
        const value = unit * r.quantity;
        return `${r.material?.code || ''},${JSON.stringify(r.material?.name || '')},${r.batch?.batchNumber || ''},${r.batch?.barcode || ''},${r.warehouse?.code || ''},${r.quantity},${unit},${value}`;
      })
      .join('\n');
    return header + body;
  }
}
