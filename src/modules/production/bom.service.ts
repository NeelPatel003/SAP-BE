import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';
import { ReservationEngine } from '../store/engines/reservation.engine';
import { FifoEngine } from '../store/engines/fifo.engine';

@Injectable()
export class BomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
    private readonly reservations: ReservationEngine,
    private readonly fifo: FifoEngine,
  ) {}

  async list(companyId: string, q: PaginationQueryDto & { status?: string }) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.bomHeader.findMany({
        where,
        include: {
          material: true,
          lines: { include: { componentMaterial: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.bomHeader.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async get(companyId: string, id: string) {
    const bom = await this.prisma.bomHeader.findFirst({
      where: { id, companyId },
      include: {
        material: true,
        lines: { include: { componentMaterial: true } },
      },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    return bom;
  }

  async create(
    companyId: string,
    body: {
      materialId: string;
      version?: string;
      status?: string;
      notes?: string;
      lines: {
        componentMaterialId: string;
        quantity: number;
        scrapFactor?: number;
      }[];
    },
  ) {
    const fg = await this.prisma.material.findFirst({
      where: { id: body.materialId, companyId },
    });
    if (!fg) throw new NotFoundException('FG material not found');
    if (!body.lines?.length) {
      throw new BadRequestException('At least one BOM line required');
    }
    for (const line of body.lines) {
      if (!(line.quantity > 0)) {
        throw new BadRequestException('Invalid component quantity');
      }
      if (line.componentMaterialId === body.materialId) {
        throw new BadRequestException('Component cannot equal FG material');
      }
      const c = await this.prisma.material.findFirst({
        where: { id: line.componentMaterialId, companyId },
      });
      if (!c) throw new BadRequestException('Component material not found');
    }

    const version = (body.version || 'v1').trim();
    try {
      return await this.prisma.bomHeader.create({
        data: {
          companyId,
          materialId: body.materialId,
          version,
          status: body.status || 'draft',
          notes: body.notes,
          lines: {
            create: body.lines.map((l) => ({
              componentMaterialId: l.componentMaterialId,
              quantity: l.quantity,
              scrapFactor: l.scrapFactor,
            })),
          },
        },
        include: {
          material: true,
          lines: { include: { componentMaterial: true } },
        },
      });
    } catch {
      throw new BadRequestException(
        'BOM already exists for this material version',
      );
    }
  }

  async update(
    companyId: string,
    id: string,
    body: {
      status?: string;
      notes?: string;
      lines?: {
        componentMaterialId: string;
        quantity: number;
        scrapFactor?: number;
      }[];
    },
  ) {
    const existing = await this.prisma.bomHeader.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('BOM not found');

    if (body.lines) {
      if (!body.lines.length) {
        throw new BadRequestException('At least one BOM line required');
      }
      for (const line of body.lines) {
        if (!(line.quantity > 0)) {
          throw new BadRequestException('Invalid component quantity');
        }
        const c = await this.prisma.material.findFirst({
          where: { id: line.componentMaterialId, companyId },
        });
        if (!c) throw new BadRequestException('Component material not found');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (body.lines) {
        await tx.bomLine.deleteMany({ where: { bomHeaderId: id } });
        await tx.bomLine.createMany({
          data: body.lines.map((l) => ({
            bomHeaderId: id,
            componentMaterialId: l.componentMaterialId,
            quantity: l.quantity,
            scrapFactor: l.scrapFactor,
          })),
        });
      }
      return tx.bomHeader.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
        include: {
          material: true,
          lines: { include: { componentMaterial: true } },
        },
      });
    });
  }

  async explode(
    companyId: string,
    bomId: string,
    userId: string,
    body: { productionOrderId: string; fgQty: number; notes?: string },
  ) {
    if (!(body.fgQty > 0)) {
      throw new BadRequestException('fgQty must be positive');
    }
    const bom = await this.prisma.bomHeader.findFirst({
      where: { id: bomId, companyId },
      include: { lines: true },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    if (bom.status !== 'active') {
      throw new BadRequestException('BOM must be active to explode');
    }
    if (!bom.lines.length) {
      throw new BadRequestException('BOM has no lines');
    }

    const po = await this.prisma.productionOrder.findFirst({
      where: { id: body.productionOrderId, companyId },
    });
    if (!po) throw new NotFoundException('Production order not found');

    const number = await this.series.next(companyId, 'material_request');
    const request = await this.prisma.materialRequest.create({
      data: {
        companyId,
        number,
        productionOrderId: body.productionOrderId,
        requestedBy: userId,
        notes:
          body.notes ||
          `BOM ${bom.version} explode · FG qty ${body.fgQty} · bom:${bom.id}`,
        createdById: userId,
        status: 'pending',
        lines: {
          create: bom.lines.map((l) => {
            const scrap = l.scrapFactor && l.scrapFactor > 0 ? l.scrapFactor : 0;
            const qty = l.quantity * body.fgQty * (1 + scrap);
            return {
              materialId: l.componentMaterialId,
              requestedQty: Math.round(qty * 10000) / 10000,
            };
          }),
        },
      },
      include: {
        productionOrder: true,
        lines: { include: { material: true } },
      },
    });
    for (const line of request.lines) {
      const suggestion = await this.fifo.suggestBatches(
        companyId,
        line.materialId,
        line.requestedQty,
      );
      if (!suggestion.fullyCovered) continue;
      for (const pick of suggestion.picks) {
        await this.reservations.create({
          companyId,
          materialId: line.materialId,
          quantity: pick.quantity,
          productionOrderId: body.productionOrderId,
          batchId: pick.batchId,
          warehouseId: pick.warehouseId,
          priority: po.priority,
          productionDate: po.requiredDate ?? undefined,
          notes: `Auto-reserved for ${request.number}`,
        });
      }
    }
    return request;
  }
}
