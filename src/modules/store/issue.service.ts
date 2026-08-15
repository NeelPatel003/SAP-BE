import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockEngine } from './engines/stock.engine';
import { FifoEngine } from './engines/fifo.engine';
import { LocationEngine } from './engines/location.engine';
import { ReservationEngine } from './engines/reservation.engine';
import { paginateParams, paginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';
import { resolveWorkflow } from '../../common/workflow/company-workflow';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockEngine,
    private readonly fifo: FifoEngine,
    private readonly locations: LocationEngine,
    private readonly reservations: ReservationEngine,
    private readonly series: DocumentSeriesService,
    private readonly audit: AuditService,
  ) {}

  private async nextIssueNumber(companyId: string) {
    return this.series.next(companyId, 'material_issue');
  }

  async suggestFifo(
    companyId: string,
    materialId: string,
    quantity: number,
    warehouseId?: string,
    status?: string,
  ) {
    return this.fifo.suggestBatches(
      companyId,
      materialId,
      quantity,
      warehouseId,
      status || 'available',
    );
  }

  async createIssue(
    companyId: string,
    userId: string,
    userPermissions: string[],
    dto: {
      warehouseId: string;
      productionOrderId?: string;
      materialRequestId?: string;
      issuedBy?: string;
      receivedBy?: string;
      notes?: string;
      allowFifoOverride?: boolean;
      overrideReason?: string;
      lines: {
        materialId: string;
        batchId: string;
        quantity: number;
        locationId?: string;
        serials?: string[];
      }[];
    },
  ) {
    await this.locations.assertWarehouse(companyId, dto.warehouseId);
    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line required');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });
    const workflow = resolveWorkflow(company?.settings);

    let productionOrderId = dto.productionOrderId;
    if (dto.materialRequestId) {
      const req = await this.prisma.materialRequest.findFirst({
        where: { id: dto.materialRequestId, companyId },
      });
      if (!req) throw new NotFoundException('Material request not found');
      if (req.status === 'fulfilled' || req.status === 'cancelled') {
        throw new BadRequestException('Material request is closed');
      }
      if (!productionOrderId && req.productionOrderId) {
        productionOrderId = req.productionOrderId;
      }
    }

    if (workflow.issueRequiresProductionOrder && !productionOrderId) {
      throw new BadRequestException(
        'Production order is required by company workflow policy',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextIssueNumber(companyId);
      const issue = await tx.materialIssue.create({
        data: {
          companyId,
          number,
          warehouseId: dto.warehouseId,
          productionOrderId,
          issuedBy: dto.issuedBy,
          receivedBy: dto.receivedBy,
          notes: dto.materialRequestId
            ? `${dto.notes || ''} [MR:${dto.materialRequestId}]`.trim()
            : dto.notes,
          createdById: userId,
          status: 'posted',
        },
      });

      let reservedConsumed = false;

      for (const line of dto.lines) {
        const activeReservation = await tx.planningReservation.findFirst({
          where: {
            companyId,
            materialId: line.materialId,
            status: 'active',
            ...(productionOrderId
              ? { productionOrderId }
              : {}),
            OR: [{ batchId: line.batchId }, { batchId: null }],
          },
        });
        const preferReserved =
          !!dto.materialRequestId || !!activeReservation;

        const reserved = preferReserved
          ? await tx.inventoryStock.findFirst({
              where: {
                companyId,
                materialId: line.materialId,
                batchId: line.batchId,
                warehouseId: dto.warehouseId,
                status: 'reserved',
                quantity: { gte: line.quantity },
                ...(line.locationId ? { locationId: line.locationId } : {}),
              },
            })
          : null;

        let fifoOverride = false;

        if (reserved) {
          await this.reservations.consumeForIssue(tx, {
            companyId,
            materialId: line.materialId,
            batchId: line.batchId,
            warehouseId: dto.warehouseId,
            locationId: reserved.locationId,
            quantity: line.quantity,
            productionOrderId,
            createdById: userId,
            referenceId: issue.id,
          });
          reservedConsumed = true;
        } else {
          const suggestion = await this.fifo.suggestBatches(
            companyId,
            line.materialId,
            line.quantity,
            dto.warehouseId,
          );
          const first = suggestion.picks[0];
          const isFifo =
            !first || first.batchId === line.batchId || dto.allowFifoOverride;

          if (!isFifo) {
            throw new BadRequestException(
              `FIFO violation: expected batch ${first?.batchNumber}`,
            );
          }

          if (
            first &&
            first.batchId !== line.batchId &&
            dto.allowFifoOverride
          ) {
            if (!userPermissions.includes('store.fifo.override')) {
              throw new ForbiddenException('FIFO override permission required');
            }
            fifoOverride = true;
            await tx.fifoOverrideLog.create({
              data: {
                companyId,
                materialId: line.materialId,
                batchId: line.batchId,
                quantity: line.quantity,
                reason: dto.overrideReason,
                approvedBy: userId,
                createdById: userId,
              },
            });
          }

          const avail = await tx.inventoryStock.findFirst({
            where: {
              companyId,
              materialId: line.materialId,
              batchId: line.batchId,
              warehouseId: dto.warehouseId,
              status: 'available',
              quantity: { gte: line.quantity },
              ...(line.locationId ? { locationId: line.locationId } : {}),
            },
          });
          if (!avail) {
            throw new BadRequestException(
              preferReserved
                ? 'Insufficient reserved or available stock for issue'
                : 'Insufficient approved (available) stock for issue',
            );
          }

          await this.stock.deduct(
            {
              companyId,
              materialId: line.materialId,
              batchId: line.batchId,
              warehouseId: dto.warehouseId,
              locationId: avail.locationId,
              status: 'available',
            },
            line.quantity,
            {
              transactionType: 'issue',
              referenceType: 'material_issue',
              referenceId: issue.id,
              createdById: userId,
            },
            tx,
          );
        }

        const issueItem = await tx.materialIssueItem.create({
          data: {
            materialIssueId: issue.id,
            materialId: line.materialId,
            batchId: line.batchId,
            quantity: line.quantity,
            fifoOverride,
          },
        });

        if (line.serials?.length) {
          const material = await tx.material.findFirst({
            where: { id: line.materialId, companyId },
          });
          if (!material?.serialTracked) {
            throw new BadRequestException(
              'Serials provided for non-serial-tracked material',
            );
          }
          const cleaned = [
            ...new Set(
              line.serials.map((s) => String(s || '').trim()).filter(Boolean),
            ),
          ];
          for (const serialNumber of cleaned) {
            let ser = await tx.inventorySerial.findFirst({
              where: { companyId, serialNumber },
            });
            if (!ser) {
              ser = await tx.inventorySerial.create({
                data: {
                  companyId,
                  materialId: line.materialId,
                  batchId: line.batchId,
                  serialNumber,
                  status: 'available',
                },
              });
            }
            if (ser.materialId !== line.materialId) {
              throw new BadRequestException(
                `Serial ${serialNumber} belongs to another material`,
              );
            }
            if (ser.status !== 'available') {
              throw new BadRequestException(
                `Serial not available: ${serialNumber}`,
              );
            }
            await tx.inventorySerial.update({
              where: { id: ser.id },
              data: {
                status: 'issued',
                materialIssueItemId: issueItem.id,
                batchId: ser.batchId || line.batchId,
              },
            });
          }
        }

        await tx.batchTraceabilityLink.create({
          data: {
            companyId,
            linkType: 'batch_to_issue',
            fromBatchId: line.batchId,
            referenceType: 'material_issue',
            referenceId: issue.id,
            meta: { productionOrderId: productionOrderId },
          },
        });

        if (productionOrderId) {
          await tx.batchTraceabilityLink.create({
            data: {
              companyId,
              linkType: 'issue_to_production',
              fromBatchId: line.batchId,
              referenceType: 'production_order',
              referenceId: productionOrderId,
              meta: { issueId: issue.id },
            },
          });
        }

        if (dto.materialRequestId) {
          const mrLine = await tx.materialRequestLine.findFirst({
            where: {
              materialRequestId: dto.materialRequestId,
              materialId: line.materialId,
            },
          });
          if (mrLine) {
            await tx.materialRequestLine.update({
              where: { id: mrLine.id },
              data: { issuedQty: mrLine.issuedQty + line.quantity },
            });
          }
        }
      }

      if (dto.materialRequestId) {
        const lines = await tx.materialRequestLine.findMany({
          where: { materialRequestId: dto.materialRequestId },
        });
        const allDone = lines.every((l) => l.issuedQty >= l.requestedQty);
        const any = lines.some((l) => l.issuedQty > 0);
        await tx.materialRequest.update({
          where: { id: dto.materialRequestId },
          data: {
            status: allDone ? 'fulfilled' : any ? 'partial' : 'pending',
          },
        });
      }

      const created = await tx.materialIssue.findUnique({
        where: { id: issue.id },
        include: {
          items: { include: { material: true, batch: true } },
          productionOrder: true,
          warehouse: true,
        },
      });

      return { ...created!, reservedConsumed };
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'store.issue.posted',
      entityType: 'material_issue',
      entityId: result.id,
      meta: {
        number: result.number,
        reservedConsumed: result.reservedConsumed,
        lineCount: result.items?.length ?? 0,
      },
    });

    return result;
  }

  async listIssues(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.materialIssue.findMany({
        where,
        include: {
          items: { include: { material: true, batch: true } },
          productionOrder: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.materialIssue.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async createReturn(
    companyId: string,
    userId: string,
    dto: {
      warehouseId: string;
      returnedBy?: string;
      notes?: string;
      lines: {
        materialId: string;
        batchId: string;
        quantity: number;
        condition?: 'good' | 'damaged' | 'rejected';
        locationId?: string;
      }[];
    },
  ) {
    await this.locations.assertWarehouse(companyId, dto.warehouseId);
    const number = await this.series.next(companyId, 'material_return');

    const result = await this.prisma.$transaction(async (tx) => {
      const ret = await tx.materialReturn.create({
        data: {
          companyId,
          number,
          warehouseId: dto.warehouseId,
          returnedBy: dto.returnedBy,
          notes: dto.notes,
          createdById: userId,
        },
      });

      for (const line of dto.lines) {
        const condition = line.condition || 'good';
        const status =
          condition === 'good'
            ? 'available'
            : condition === 'damaged'
              ? 'damaged'
              : 'rejected';

        await this.stock.add(
          {
            companyId,
            materialId: line.materialId,
            batchId: line.batchId,
            warehouseId: dto.warehouseId,
            locationId: line.locationId,
            status,
          },
          line.quantity,
          {
            transactionType: 'return',
            referenceType: 'material_return',
            referenceId: ret.id,
            createdById: userId,
          },
          tx,
        );

        await tx.materialReturnItem.create({
          data: {
            materialReturnId: ret.id,
            materialId: line.materialId,
            batchId: line.batchId,
            quantity: line.quantity,
            condition,
          },
        });

        await tx.batchTraceabilityLink.create({
          data: {
            companyId,
            linkType: 'batch_to_return',
            toBatchId: line.batchId,
            referenceType: 'material_return',
            referenceId: ret.id,
          },
        });
      }

      return tx.materialReturn.findUnique({
        where: { id: ret.id },
        include: { items: { include: { material: true, batch: true } } },
      });
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'store.return.posted',
      entityType: 'material_return',
      entityId: result!.id,
      meta: { number: result!.number },
    });

    return result;
  }

  async createTransfer(
    companyId: string,
    userId: string,
    dto: {
      fromWarehouseId: string;
      toWarehouseId: string;
      notes?: string;
      lines: {
        materialId: string;
        batchId: string;
        quantity: number;
        fromLocationId?: string;
        toLocationId?: string;
        status?: string;
      }[];
    },
  ) {
    await this.locations.assertWarehouse(companyId, dto.fromWarehouseId);
    await this.locations.assertWarehouse(companyId, dto.toWarehouseId);

    const number = await this.series.next(companyId, 'stock_transfer');

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          number,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          notes: dto.notes,
          createdById: userId,
          status: 'posted',
        },
      });

      for (const line of dto.lines) {
        const status = line.status || 'available';
        await this.stock.move(
          {
            companyId,
            materialId: line.materialId,
            batchId: line.batchId,
            warehouseId: dto.fromWarehouseId,
            locationId: line.fromLocationId,
            status,
          },
          {
            warehouseId: dto.toWarehouseId,
            locationId: line.toLocationId,
            status,
          },
          line.quantity,
          {
            outType: 'transfer_out',
            inType: 'transfer_in',
            referenceType: 'stock_transfer',
            referenceId: transfer.id,
            createdById: userId,
          },
          tx,
        );

        await tx.stockTransferLine.create({
          data: {
            stockTransferId: transfer.id,
            materialId: line.materialId,
            batchId: line.batchId,
            fromLocationId: line.fromLocationId,
            toLocationId: line.toLocationId,
            quantity: line.quantity,
            status,
          },
        });

        await tx.batchTraceabilityLink.create({
          data: {
            companyId,
            linkType: 'batch_to_transfer',
            fromBatchId: line.batchId,
            referenceType: 'stock_transfer',
            referenceId: transfer.id,
          },
        });
      }

      return tx.stockTransfer.findUnique({
        where: { id: transfer.id },
        include: { lines: { include: { material: true, batch: true } } },
      });
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'store.transfer.posted',
      entityType: 'stock_transfer',
      entityId: result!.id,
      meta: { number: result!.number },
    });

    return result;
  }

  async listReturns(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.materialReturn.findMany({
        where,
        include: {
          items: { include: { material: true, batch: true } },
          warehouse: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.materialReturn.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async listTransfers(companyId: string, q: PaginationQueryDto) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(p.search
        ? { number: { contains: p.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: {
          lines: { include: { material: true, batch: true } },
          fromWarehouse: true,
          toWarehouse: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }
}
