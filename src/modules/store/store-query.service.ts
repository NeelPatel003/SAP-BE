import { Injectable, NotFoundException } from '@nestjs/common';
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
      stockRows,
      poPrices,
      stockAboveMax,
      topConsumedRaw,
      totalLocations,
      occupiedLocationsRaw,
      movement7dRaw,
    ] = await Promise.all([
      this.stock.sumByStatus(companyId, 'available'),
      this.stock.sumByStatus(companyId, 'reserved'),
      this.stock.sumByStatus(companyId, 'quality_hold'),
      this.stock.sumByStatus(companyId, 'rejected'),
      this.prisma.goodsReceipt.count({
        where: { companyId, status: 'pending_qc' },
      }),
      this.prisma.materialRequest.count({
        where: { companyId, status: { in: ['pending', 'partial', 'open'] } },
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
      this.prisma.inventoryStock.findMany({
        where: { companyId, quantity: { gt: 0 } },
        select: { materialId: true, quantity: true },
      }),
      this.prisma.purchaseOrderItem.findMany({
        where: { purchaseOrder: { companyId }, unitPrice: { not: null } },
        select: { materialId: true, unitPrice: true },
        orderBy: { purchaseOrder: { orderDate: 'desc' } },
      }),
      this.prisma.$queryRawUnsafe<
        { id: string; code: string; name: string; qty: number; max_stock: number }[]
      >(
        `SELECT m.id, m.code, m.name,
                COALESCE(SUM(s.quantity), 0)::float AS qty, m.max_stock
         FROM materials m
         JOIN inventory_stock s ON s.material_id = m.id AND s.company_id = m.company_id
         WHERE m.company_id = $1 AND s.quantity > 0
         GROUP BY m.id
         HAVING COALESCE(SUM(s.quantity), 0) > m.max_stock AND m.max_stock > 0
         ORDER BY qty DESC LIMIT 20`,
        companyId,
      ),
      this.prisma.inventoryTransaction.groupBy({
        by: ['materialId'],
        where: { companyId, transactionType: 'issue' },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'asc' } },
        take: 10,
      }),
      this.prisma.location.count({ where: { companyId, isActive: true } }),
      this.prisma.inventoryStock.findMany({
        where: { companyId, quantity: { gt: 0 }, locationId: { not: null } },
        distinct: ['locationId'],
        select: { locationId: true },
      }),
      this.prisma.$queryRawUnsafe<
        { day: Date; inward: number; outward: number }[]
      >(
        `SELECT date_trunc('day', created_at)::date AS day,
                COALESCE(SUM(quantity) FILTER (WHERE quantity > 0), 0)::float AS inward,
                COALESCE(ABS(SUM(quantity) FILTER (WHERE quantity < 0)), 0)::float AS outward
         FROM inventory_transactions
         WHERE company_id = $1
           AND created_at >= (CURRENT_DATE - INTERVAL '6 days')
         GROUP BY 1
         ORDER BY 1`,
        companyId,
      ),
    ]);
    const priceByMaterial = new Map<string, number>();
    for (const row of poPrices) {
      if (row.unitPrice != null && !priceByMaterial.has(row.materialId)) {
        priceByMaterial.set(row.materialId, row.unitPrice);
      }
    }
    const materialIds = topConsumedRaw.map((row) => row.materialId);
    const consumedMaterials = await this.prisma.material.findMany({
      where: { companyId, id: { in: materialIds } },
      select: { id: true, code: true, name: true },
    });
    const consumedById = new Map(consumedMaterials.map((m) => [m.id, m]));

    return {
      availableStock: available,
      reservedStock: reserved,
      qualityHoldStock: qualityHold,
      rejectedStock: rejected,
      pendingQc,
      pendingReservations: pendingIssueRequests,
      pendingIssues: pendingIssueRequests,
      totalInventoryValue: stockRows.reduce(
        (sum, row) => sum + row.quantity * (priceByMaterial.get(row.materialId) ?? 0),
        0,
      ),
      stockAboveMax,
      topConsumedMaterials: topConsumedRaw.map((row) => ({
        material: consumedById.get(row.materialId),
        quantity: Math.abs(row._sum.quantity ?? 0),
      })),
      warehouseUtilizationPct:
        totalLocations > 0
          ? Math.round((occupiedLocationsRaw.length / totalLocations) * 1000) / 10
          : 0,
      inwardToday: inwardToday._sum.quantity ?? 0,
      outwardToday: Math.abs(outwardToday._sum.quantity ?? 0),
      stockBelowMinimum: belowMin,
      nearExpiry: aging.nearExpiry,
      expired: aging.expired,
      slowMoving: aging.slowMoving,
      deadStock: aging.deadStock,
      agingBuckets: aging.buckets,
      movementLast7Days: (() => {
        const byDay = new Map(
          (movement7dRaw || []).map((r) => [
            new Date(r.day).toISOString().slice(0, 10),
            { inward: Number(r.inward) || 0, outward: Number(r.outward) || 0 },
          ]),
        );
        const days = [];
        for (let i = 6; i >= 0; i -= 1) {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const row = byDay.get(key) || { inward: 0, outward: 0 };
          days.push({
            date: key,
            label: d.toLocaleDateString(undefined, { weekday: 'short' }),
            inward: row.inward,
            outward: row.outward,
          });
        }
        return days;
      })(),
      stockByStatus: [
        { name: 'Available', value: available },
        { name: 'Reserved', value: reserved },
        { name: 'QC hold', value: qualityHold },
        { name: 'Rejected', value: rejected },
      ],
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

  async findBatchByBarcode(companyId: string, code: string) {
    return this.prisma.inventoryBatch.findFirst({
      where: {
        companyId,
        OR: [{ barcode: code }, { qrPayload: code }, { batchNumber: code }],
      },
      include: {
        material: true,
        stocks: {
          where: { quantity: { gt: 0 } },
          include: { warehouse: true, location: true },
        },
      },
    });
  }

  async verifyStock(
    companyId: string,
    userId: string,
    input: {
      code: string;
      countedQty: number;
      warehouseId?: string;
      locationId?: string;
      notes?: string;
    },
  ) {
    const batch = await this.findBatchByBarcode(companyId, input.code);
    if (!batch) throw new NotFoundException('Batch not found');
    const matching = batch.stocks.filter(
      (s) =>
        (!input.warehouseId || s.warehouseId === input.warehouseId) &&
        (!input.locationId || s.locationId === input.locationId),
    );
    const systemQty = matching.reduce((sum, s) => sum + s.quantity, 0);
    return this.prisma.stockVerification.create({
      data: {
        companyId,
        batchId: batch.id,
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        systemQty,
        countedQty: input.countedQty,
        variance: input.countedQty - systemQty,
        notes: input.notes,
        createdById: userId,
      },
      include: { batch: { include: { material: true } } },
    });
  }

  async verificationHistory(companyId: string) {
    return this.prisma.stockVerification.findMany({
      where: { companyId },
      include: { batch: { include: { material: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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

  async reportCsv(companyId: string, kind: string) {
    const stockKinds: Record<string, string | undefined> = {
      location: undefined,
      rack: 'RACK',
      bin: 'BIN',
      category: undefined,
      batch: undefined,
      reserved: 'reserved',
      'quality-hold': 'quality_hold',
      rejected: 'rejected',
    };
    let rows: Record<string, unknown>[] = [];

    if (kind in stockKinds) {
      const status = stockKinds[kind];
      const stock = await this.prisma.inventoryStock.findMany({
        where: {
          companyId,
          quantity: { gt: 0 },
          ...(status ? { status } : {}),
          ...(kind === 'rack' || kind === 'bin'
            ? { location: { type: stockKinds[kind] as 'RACK' | 'BIN' } }
            : {}),
        },
        include: {
          material: { include: { category: true, unit: true } },
          batch: true,
          warehouse: true,
          location: true,
        },
        take: 10000,
      });
      rows = stock.map((s) => ({
        material: s.material.code,
        materialName: s.material.name,
        category: s.material.category.code,
        unit: s.material.unit.code,
        batch: s.batch.batchNumber,
        barcode: s.batch.barcode,
        warehouse: s.warehouse.code,
        location: s.location?.code ?? '',
        locationType: s.location?.type ?? '',
        status: s.status,
        quantity: s.quantity,
      }));
    } else if (['fifo', 'near-expiry', 'expired', 'slow', 'dead', 'aging'].includes(kind)) {
      const aging = await this.agingEngine.analyze(companyId);
      if (kind === 'near-expiry') rows = aging.nearExpiry;
      else if (kind === 'expired') rows = aging.expired;
      else if (kind === 'slow') rows = aging.slowMoving;
      else if (kind === 'dead') rows = aging.deadStock;
      else if (kind === 'aging') {
        rows = Object.entries(aging.buckets).map(([band, quantity]) => ({
          band,
          quantity,
        }));
      } else {
        const stock = await this.prisma.inventoryStock.findMany({
          where: { companyId, quantity: { gt: 0 }, status: 'available' },
          include: { material: true, batch: true, warehouse: true, location: true },
          orderBy: [{ materialId: 'asc' }, { batch: { receivedAt: 'asc' } }],
          take: 10000,
        });
        rows = stock.map((s) => ({
          material: s.material.code,
          batch: s.batch.batchNumber,
          receivedAt: s.batch.receivedAt,
          expiryDate: s.batch.expiryDate,
          warehouse: s.warehouse.code,
          location: s.location?.code ?? '',
          quantity: s.quantity,
        }));
      }
    } else if (kind === 'traceability') {
      const links = await this.prisma.batchTraceabilityLink.findMany({
        where: { companyId },
        include: { fromBatch: true, toBatch: true },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });
      rows = links.map((l) => ({
        createdAt: l.createdAt,
        linkType: l.linkType,
        fromBatch: l.fromBatch?.batchNumber ?? '',
        toBatch: l.toBatch?.batchNumber ?? '',
        referenceType: l.referenceType ?? '',
        referenceId: l.referenceId ?? '',
      }));
    } else if (kind === 'returns') {
      const docs = await this.prisma.materialReturn.findMany({
        where: { companyId },
        include: { warehouse: true, items: { include: { material: true, batch: true } } },
        take: 5000,
      });
      rows = docs.flatMap((d) =>
        d.items.map((line) => ({
          number: d.number,
          date: d.returnDate,
          warehouse: d.warehouse.code,
          material: line.material.code,
          batch: line.batch.batchNumber,
          condition: line.condition,
          quantity: line.quantity,
        })),
      );
    } else if (kind === 'transfers') {
      const docs = await this.prisma.stockTransfer.findMany({
        where: { companyId },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          lines: { include: { material: true, batch: true } },
        },
        take: 5000,
      });
      rows = docs.flatMap((d) =>
        d.lines.map((line) => ({
          number: d.number,
          date: d.transferDate,
          fromWarehouse: d.fromWarehouse.code,
          toWarehouse: d.toWarehouse.code,
          material: line.material.code,
          batch: line.batch.batchNumber,
          quantity: line.quantity,
        })),
      );
    } else if (kind === 'consumption') {
      const tx = await this.prisma.inventoryTransaction.findMany({
        where: { companyId, transactionType: 'issue' },
        include: { material: true, batch: true, warehouse: true },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });
      rows = tx.map((t) => ({
        date: t.createdAt,
        material: t.material.code,
        batch: t.batch?.batchNumber ?? '',
        warehouse: t.warehouse?.code ?? '',
        quantity: Math.abs(t.quantity),
        referenceId: t.referenceId ?? '',
      }));
    } else if (kind === 'verification-variances') {
      const verifications = await this.verificationHistory(companyId);
      rows = verifications.map((v) => ({
        date: v.createdAt,
        material: v.batch.material.code,
        batch: v.batch.batchNumber,
        systemQty: v.systemQty,
        countedQty: v.countedQty,
        variance: v.variance,
        notes: v.notes ?? '',
      }));
    } else {
      throw new NotFoundException('Unknown report');
    }

    return this.recordsToCsv(rows);
  }

  private recordsToCsv(rows: Record<string, unknown>[]) {
    if (!rows.length) return 'message\nNo records\n';
    const keys = Object.keys(rows[0]);
    const escape = (value: unknown) => {
      const normalized =
        value instanceof Date
          ? value.toISOString()
          : value && typeof value === 'object'
            ? JSON.stringify(value)
            : String(value ?? '');
      return `"${normalized.replace(/"/g, '""')}"`;
    };
    return [
      keys.join(','),
      ...rows.map((row) => keys.map((key) => escape(row[key])).join(',')),
    ].join('\n');
  }
}
