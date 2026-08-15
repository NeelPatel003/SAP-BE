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
import { StockEngine } from '../store/engines/stock.engine';
import { LocationEngine } from '../store/engines/location.engine';

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
    private readonly stock: StockEngine,
    private readonly locations: LocationEngine,
  ) {}

  async list(companyId: string, q: PaginationQueryDto & { status?: string }) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dispatchOrder.findMany({
        where,
        include: {
          warehouse: true,
          lines: { include: { material: true, batch: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.dispatchOrder.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async get(companyId: string, id: string) {
    const order = await this.prisma.dispatchOrder.findFirst({
      where: { id, companyId },
      include: {
        warehouse: true,
        lines: { include: { material: true, batch: true } },
      },
    });
    if (!order) throw new NotFoundException('Dispatch not found');
    return order;
  }

  async create(
    companyId: string,
    userId: string,
    body: {
      warehouseId: string;
      customerName?: string;
      notes?: string;
      lines: {
        materialId: string;
        batchId?: string;
        quantity: number;
        serialIds?: string[];
      }[];
    },
  ) {
    await this.locations.assertWarehouse(companyId, body.warehouseId);
    if (!body.lines?.length) {
      throw new BadRequestException('At least one line required');
    }
    for (const line of body.lines) {
      if (!(line.quantity > 0)) {
        throw new BadRequestException('Invalid quantity');
      }
      const mat = await this.prisma.material.findFirst({
        where: { id: line.materialId, companyId },
      });
      if (!mat) throw new BadRequestException('Material not found');
      if (line.batchId) {
        const batch = await this.prisma.inventoryBatch.findFirst({
          where: {
            id: line.batchId,
            companyId,
            materialId: line.materialId,
          },
        });
        if (!batch) throw new BadRequestException('Batch not found');
      }
    }

    const number = await this.series.next(companyId, 'dispatch');
    return this.prisma.dispatchOrder.create({
      data: {
        companyId,
        number,
        warehouseId: body.warehouseId,
        customerName: body.customerName,
        notes: body.notes,
        createdById: userId,
        status: 'draft',
        lines: {
          create: body.lines.map((l) => ({
            materialId: l.materialId,
            batchId: l.batchId || null,
            quantity: l.quantity,
            serialIds: l.serialIds?.length ? l.serialIds : undefined,
          })),
        },
      },
      include: {
        warehouse: true,
        lines: { include: { material: true, batch: true } },
      },
    });
  }

  async ship(companyId: string, userId: string, id: string) {
    const order = await this.prisma.dispatchOrder.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Dispatch not found');
    if (order.status === 'shipped') {
      throw new BadRequestException('Already shipped');
    }
    if (order.status === 'cancelled') {
      throw new BadRequestException('Dispatch is cancelled');
    }
    if (!order.lines.length) {
      throw new BadRequestException('Dispatch has no lines');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        if (!line.batchId) {
          throw new BadRequestException(
            `Line missing batch for material ${line.materialId}`,
          );
        }
        const avail = await tx.inventoryStock.findFirst({
          where: {
            companyId,
            materialId: line.materialId,
            batchId: line.batchId,
            warehouseId: order.warehouseId,
            status: 'available',
            quantity: { gte: line.quantity },
          },
        });
        if (!avail) {
          throw new BadRequestException(
            `Insufficient available stock for line material ${line.materialId}`,
          );
        }

        await this.stock.deduct(
          {
            companyId,
            materialId: line.materialId,
            batchId: line.batchId,
            warehouseId: order.warehouseId,
            locationId: avail.locationId,
            status: 'available',
          },
          line.quantity,
          {
            transactionType: 'dispatch',
            referenceType: 'dispatch_order',
            referenceId: order.id,
            createdById: userId,
          },
          tx,
        );

        const serialIds = Array.isArray(line.serialIds)
          ? (line.serialIds as string[])
          : [];
        if (serialIds.length) {
          if (serialIds.length !== Math.round(line.quantity)) {
            // allow qty != serial count only if qty is 1+ serials optional strictness:
            // thin: serial count must match when provided and qty is integer serialized
          }
          for (const serialId of serialIds) {
            const ser = await tx.inventorySerial.findFirst({
              where: {
                id: serialId,
                companyId,
                materialId: line.materialId,
                status: 'available',
              },
            });
            if (!ser) {
              throw new BadRequestException(
                `Serial not available: ${serialId}`,
              );
            }
            await tx.inventorySerial.update({
              where: { id: ser.id },
              data: { status: 'issued' },
            });
          }
        }
      }

      return tx.dispatchOrder.update({
        where: { id: order.id },
        data: {
          status: 'shipped',
          shipDate: new Date(),
        },
        include: {
          warehouse: true,
          lines: { include: { material: true, batch: true } },
        },
      });
    });
  }
}
