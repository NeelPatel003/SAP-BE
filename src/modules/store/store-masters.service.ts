import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginateParams, paginatedResult } from '../../common/dto/pagination.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Injectable()
export class StoreMastersService {
  constructor(private readonly prisma: PrismaService) {}

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  async listCategories(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? {
            OR: [
              { code: { contains: p.search, mode: 'insensitive' as const } },
              { name: { contains: p.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.materialCategory.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.materialCategory.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  createCategory(
    companyId: string,
    data: { code: string; name: string; description?: string },
  ) {
    return this.prisma.materialCategory.create({
      data: { companyId, ...data },
    });
  }

  async listMaterials(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? {
            OR: [
              { code: { contains: p.search, mode: 'insensitive' as const } },
              { name: { contains: p.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        include: {
          category: true,
          unit: true,
          defaultWarehouse: true,
          defaultLocation: true,
        },
        orderBy: { code: 'asc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.material.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async createMaterial(
    companyId: string,
    data: {
      code: string;
      name: string;
      categoryId: string;
      unitId: string;
      qcRequired?: boolean;
      serialTracked?: boolean;
      minStock?: number;
      maxStock?: number;
      reorderLevel?: number;
      reorderQty?: number;
      safetyStock?: number;
      defaultWarehouseId?: string;
      defaultLocationId?: string;
      shelfLifeDays?: number;
      hsn?: string;
      gstPercent?: number;
    },
  ) {
    let qcRequired = data.qcRequired;
    if (qcRequired === undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });
      const store =
        company?.settings && typeof company.settings === 'object'
          ? (company.settings as { defaultQcRequired?: boolean })
          : {};
      qcRequired =
        typeof store.defaultQcRequired === 'boolean'
          ? store.defaultQcRequired
          : true;
    }
    return this.prisma.material.create({
      data: { companyId, status: 'active', ...data, qcRequired },
    });
  }

  async listWarehouses(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId },
      include: { locations: { orderBy: { code: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  createWarehouse(
    companyId: string,
    data: { code: string; name: string; address?: string },
  ) {
    return this.prisma.warehouse.create({ data: { companyId, ...data } });
  }

  createLocation(
    companyId: string,
    data: {
      warehouseId: string;
      parentId?: string;
      type: 'ZONE' | 'RACK' | 'SHELF' | 'BIN';
      code: string;
      name: string;
    },
  ) {
    return this.prisma.location.create({
      data: { companyId, ...data },
    });
  }

  async updateMaterial(
    companyId: string,
    id: string,
    data: {
      name?: string;
      categoryId?: string;
      unitId?: string;
      qcRequired?: boolean;
      serialTracked?: boolean;
      minStock?: number;
      maxStock?: number;
      reorderLevel?: number;
      reorderQty?: number;
      safetyStock?: number;
      defaultWarehouseId?: string | null;
      defaultLocationId?: string | null;
      shelfLifeDays?: number | null;
      leadTimeDays?: number | null;
      hsn?: string | null;
      gstPercent?: number | null;
      drawingNumber?: string | null;
      revision?: string | null;
      preferredSupplierId?: string | null;
      status?: string;
      subcategory?: string | null;
    },
  ) {
    const existing = await this.prisma.material.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Material not found');
    return this.prisma.material.update({
      where: { id },
      data,
      include: { category: true, unit: true },
    });
  }

  async listPurchaseOrders(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          items: { include: { material: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    const mapped = items.map((po) => ({
      ...po,
      items: po.items.map((it) => ({
        ...it,
        pendingQty: Math.max(0, it.orderedQty - it.receivedQty),
      })),
    }));

    return paginatedResult(mapped, total, p.page, p.pageSize);
  }

  async getPurchaseOrder(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        items: { include: { material: true } },
      },
    });
    if (!po) throw new NotFoundException('PO not found');
    return {
      ...po,
      items: po.items.map((it) => ({
        ...it,
        pendingQty: Math.max(0, it.orderedQty - it.receivedQty),
      })),
    };
  }

  listProductionOrders(companyId: string) {
    return this.prisma.productionOrder.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listSuppliers(companyId: string) {
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }
}
