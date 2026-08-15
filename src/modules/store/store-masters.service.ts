import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginateParams, paginatedResult } from '../../common/dto/pagination.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/store.dto';

@Injectable()
export class StoreMastersService {
  constructor(private readonly prisma: PrismaService) {}

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
  }

  createUnit(data: { code: string; name: string }) {
    return this.prisma.unit.create({
      data: { code: data.code.trim().toUpperCase(), name: data.name.trim() },
    });
  }

  updateUnit(id: string, data: { name?: string }) {
    return this.prisma.unit.update({ where: { id }, data });
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
    data: CreateMaterialDto,
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

  async getMaterial(companyId: string, id: string) {
    const material = await this.prisma.material.findFirst({
      where: { id, companyId },
      include: {
        category: true,
        unit: true,
        defaultWarehouse: true,
        defaultLocation: true,
        preferredSupplier: true,
      },
    });
    if (!material) throw new NotFoundException('Material not found');
    return material;
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

  async createLocation(
    companyId: string,
    data: {
      warehouseId: string;
      parentId?: string;
      type: 'ZONE' | 'RACK' | 'SHELF' | 'BIN';
      code: string;
      name: string;
    },
  ) {
    const parentTypes: Record<string, string | null> = {
      ZONE: null,
      RACK: 'ZONE',
      SHELF: 'RACK',
      BIN: 'SHELF',
    };
    const requiredParent = parentTypes[data.type];
    if (requiredParent) {
      const parent = await this.prisma.location.findFirst({
        where: {
          id: data.parentId,
          companyId,
          warehouseId: data.warehouseId,
          type: requiredParent as 'ZONE' | 'RACK' | 'SHELF' | 'BIN',
        },
      });
      if (!parent) {
        throw new BadRequestException(`${data.type} requires a ${requiredParent} parent`);
      }
    } else if (data.parentId) {
      throw new BadRequestException('ZONE cannot have a parent');
    }
    return this.prisma.location.create({
      data: { companyId, ...data },
    });
  }

  async updateMaterial(
    companyId: string,
    id: string,
    data: UpdateMaterialDto,
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
