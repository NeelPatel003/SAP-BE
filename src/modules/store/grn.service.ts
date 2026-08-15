import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BatchEngine } from './engines/batch.engine';
import { StockEngine } from './engines/stock.engine';
import { LocationEngine } from './engines/location.engine';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';
import {
  resolveLineQcRequired,
  resolveWorkflow,
} from '../../common/workflow/company-workflow';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

type GrnLineIn = {
  purchaseOrderItemId?: string;
  materialId?: string;
  receivedQty: number;
  damageQty?: number;
  shortQty?: number;
  excessQty?: number;
  supplierBatch?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  lotNumber?: string;
  heatNumber?: string;
};

type GrnInput = {
  purchaseOrderId?: string;
  supplierId?: string;
  warehouseId: string;
  locationId?: string;
  supplierInvoice?: string;
  supplierChallan?: string;
  vehicleNumber?: string;
  transport?: string;
  receivingPerson?: string;
  receiveDate?: string;
  allowOverReceive?: boolean;
  lines: GrnLineIn[];
};

@Injectable()
export class GrnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchEngine: BatchEngine,
    private readonly stock: StockEngine,
    private readonly locations: LocationEngine,
    private readonly series: DocumentSeriesService,
    private readonly audit: AuditService,
  ) {}

  private async nextGrnNumber(
    companyId: string,
    db: Parameters<DocumentSeriesService['next']>[2],
  ) {
    return this.series.next(companyId, 'goods_receipt', db);
  }

  private async loadWorkflow(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });
    return resolveWorkflow(company?.settings);
  }

  async list(companyId: string, q: PaginationQueryDto & { status?: string }) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.status ? { status: q.status as never } : {}),
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
          items: { include: { material: true, batch: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async get(companyId: string, id: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        purchaseOrder: { include: { items: true } },
        items: { include: { material: true, batch: true } },
      },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    return grn;
  }

  async createAndPost(
    companyId: string,
    userId: string,
    userPermissions: string[],
    dto: GrnInput,
    draftId?: string,
  ) {
    const workflow = await this.loadWorkflow(companyId);

    // Over-receive policy
    if (workflow.overReceivePolicy === 'never' && dto.allowOverReceive) {
      throw new BadRequestException(
        'Over-receive is disabled by company workflow policy',
      );
    }
    if (dto.allowOverReceive) {
      if (
        workflow.overReceivePolicy === 'permission' ||
        workflow.overReceivePolicy === 'always_if_permitted'
      ) {
        if (!userPermissions.includes('store.grn.over_receive')) {
          throw new BadRequestException(
            'Over-receive requires store.grn.over_receive permission',
          );
        }
      }
    }

    await this.locations.assertWarehouse(companyId, dto.warehouseId);
    await this.locations.assertLocation(
      companyId,
      dto.warehouseId,
      dto.locationId,
    );

    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line required');
    }

    if (workflow.grnRequiresPurchaseOrder || dto.purchaseOrderId) {
      if (!dto.purchaseOrderId) {
        throw new BadRequestException(
          'Purchase order is required by company workflow policy',
        );
      }
      const result = await this.createFromPo(
        companyId,
        userId,
        dto,
        workflow,
        draftId,
      );
      await this.audit.writeActivity({
        companyId,
        userId,
        action: 'store.grn.posted',
        entityType: 'goods_receipt',
        entityId: result.id,
        meta: { number: result.number, status: result.status },
      });
      return result;
    }

    // Ad-hoc GRN (no PO)
    if (!dto.supplierId) {
      throw new BadRequestException(
        'supplierId required when creating GRN without a purchase order',
      );
    }
    const result = await this.createAdHoc(
      companyId,
      userId,
      dto,
      workflow,
      draftId,
    );
    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'store.grn.posted',
      entityType: 'goods_receipt',
      entityId: result.id,
      meta: { number: result.number, status: result.status },
    });
    return result;
  }

  async createDraft(companyId: string, userId: string, dto: GrnInput) {
    const workflow = await this.loadWorkflow(companyId);
    let supplierId = dto.supplierId;
    if (dto.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, companyId },
      });
      if (!po) throw new NotFoundException('Purchase order not found');
      supplierId = po.supplierId;
    }
    if (workflow.grnRequiresPurchaseOrder && !dto.purchaseOrderId) {
      throw new BadRequestException('Purchase order is required by company workflow policy');
    }
    if (!supplierId) throw new BadRequestException('Supplier required');
    await this.locations.assertWarehouse(companyId, dto.warehouseId);
    const number = await this.nextGrnNumber(companyId, this.prisma);
    return this.prisma.goodsReceipt.create({
      data: {
        companyId,
        number,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId,
        status: 'draft',
        receiveDate: dto.receiveDate ? new Date(dto.receiveDate) : new Date(),
        supplierInvoice: dto.supplierInvoice,
        supplierChallan: dto.supplierChallan,
        vehicleNumber: dto.vehicleNumber,
        transport: dto.transport,
        receivingPerson: dto.receivingPerson,
        createdById: userId,
        draftPayload: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
      },
    });
  }

  async postDraft(
    companyId: string,
    userId: string,
    userPermissions: string[],
    id: string,
  ) {
    const draft = await this.prisma.goodsReceipt.findFirst({
      where: { id, companyId, status: 'draft' },
    });
    if (!draft?.draftPayload) throw new NotFoundException('GRN draft not found');
    return this.createAndPost(
      companyId,
      userId,
      userPermissions,
      draft.draftPayload as unknown as GrnInput,
      id,
    );
  }

  private async createFromPo(
    companyId: string,
    userId: string,
    dto: {
      purchaseOrderId?: string;
      warehouseId: string;
      locationId?: string;
      supplierInvoice?: string;
      supplierChallan?: string;
      vehicleNumber?: string;
      transport?: string;
      receivingPerson?: string;
      receiveDate?: string;
      allowOverReceive?: boolean;
      lines: GrnLineIn[];
    },
    workflow: ReturnType<typeof resolveWorkflow>,
    draftId?: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, companyId },
      include: { items: { include: { material: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextGrnNumber(companyId, tx);
      let anyQc = false;

      const grnData = {
          companyId,
          number,
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          status: 'draft' as const,
          receiveDate: dto.receiveDate
            ? new Date(dto.receiveDate)
            : new Date(),
          supplierInvoice: dto.supplierInvoice,
          supplierChallan: dto.supplierChallan,
          vehicleNumber: dto.vehicleNumber,
          transport: dto.transport,
          receivingPerson: dto.receivingPerson,
          createdById: userId,
      };
      const grn = draftId
        ? await tx.goodsReceipt.update({
            where: { id: draftId },
            data: { ...grnData, draftPayload: Prisma.JsonNull },
          })
        : await tx.goodsReceipt.create({ data: grnData });

      for (const line of dto.lines) {
        if (!line.purchaseOrderItemId) {
          throw new BadRequestException(
            'purchaseOrderItemId required for PO-based GRN',
          );
        }
        const poItem = po.items.find((i) => i.id === line.purchaseOrderItemId);
        if (!poItem) {
          throw new BadRequestException('Invalid PO item');
        }

        const pending = poItem.orderedQty - poItem.receivedQty;

        if (line.receivedQty <= 0) {
          throw new BadRequestException('Received qty must be positive');
        }

        if (
          !dto.allowOverReceive &&
          line.receivedQty - (line.shortQty || 0) > pending + 0.0001
        ) {
          throw new BadRequestException(
            `GRN cannot exceed PO pending qty for ${poItem.material.code} without approval`,
          );
        }

        const batchNumber = await this.batchEngine.nextBatchNumber(
          companyId,
          new Date().getFullYear(),
          tx,
        );
        const barcode = this.batchEngine.barcodePayload(
          batchNumber,
          poItem.material.code,
        );

        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            materialId: poItem.materialId,
            goodsReceiptId: grn.id,
            batchNumber,
            supplierBatch: line.supplierBatch,
            manufacturingDate: line.manufacturingDate
              ? new Date(line.manufacturingDate)
              : null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            lotNumber: line.lotNumber,
            heatNumber: line.heatNumber,
            barcode,
            qrPayload: barcode,
          },
        });

        const qcRequired = resolveLineQcRequired(
          poItem.material.qcRequired,
          workflow.qcMode,
        );
        if (qcRequired) anyQc = true;

        const grnItem = await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: grn.id,
            purchaseOrderItemId: poItem.id,
            materialId: poItem.materialId,
            warehouseId: dto.warehouseId,
            locationId: dto.locationId,
            orderedQty: poItem.orderedQty,
            receivedQty: line.receivedQty,
            damageQty: line.damageQty || 0,
            shortQty: line.shortQty || 0,
            excessQty: line.excessQty || 0,
            qcRequired,
            qcStatus: qcRequired ? 'pending' : 'waived',
            batchId: batch.id,
            supplierBatch: line.supplierBatch,
            manufacturingDate: line.manufacturingDate
              ? new Date(line.manufacturingDate)
              : null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            lotNumber: line.lotNumber,
            heatNumber: line.heatNumber,
          },
        });

        await this.putawayLine(
          {
            companyId,
            userId,
            grnId: grn.id,
            materialId: poItem.materialId,
            batchId: batch.id,
            warehouseId: dto.warehouseId,
            locationId: dto.locationId,
            receivedQty: line.receivedQty,
            damageQty: line.damageQty || 0,
            qcRequired,
            unitPrice: poItem.unitPrice,
          },
          tx,
        );

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            receivedQty:
              poItem.receivedQty + line.receivedQty - (line.shortQty || 0),
          },
        });
        poItem.receivedQty =
          poItem.receivedQty + line.receivedQty - (line.shortQty || 0);

        await tx.batchTraceabilityLink.create({
          data: {
            companyId,
            linkType: 'grn_to_batch',
            fromBatchId: null,
            toBatchId: batch.id,
            referenceType: 'goods_receipt_item',
            referenceId: grnItem.id,
            meta: { grnId: grn.id, number },
          },
        });
      }

      const freshItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });
      const allDone = freshItems.every((i) => i.receivedQty >= i.orderedQty);
      const anyRecv = freshItems.some((i) => i.receivedQty > 0);
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allDone ? 'closed' : anyRecv ? 'partial' : 'open',
        },
      });

      const status = anyQc ? 'pending_qc' : 'approved';
      const readyForAccounts =
        workflow.accountsHandoffEnabled && status === 'approved';

      return tx.goodsReceipt.update({
        where: { id: grn.id },
        data: {
          status,
          readyForAccounts,
        },
        include: {
          items: { include: { material: true, batch: true } },
          supplier: true,
          purchaseOrder: true,
        },
      });
    });
  }

  private async createAdHoc(
    companyId: string,
    userId: string,
    dto: {
      supplierId?: string;
      warehouseId: string;
      locationId?: string;
      supplierInvoice?: string;
      supplierChallan?: string;
      vehicleNumber?: string;
      transport?: string;
      receivingPerson?: string;
      receiveDate?: string;
      lines: GrnLineIn[];
    },
    workflow: ReturnType<typeof resolveWorkflow>,
    draftId?: string,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextGrnNumber(companyId, tx);
      let anyQc = false;

      const grnData = {
          companyId,
          number,
          purchaseOrderId: null,
          supplierId: supplier.id,
          status: 'draft' as const,
          receiveDate: dto.receiveDate
            ? new Date(dto.receiveDate)
            : new Date(),
          supplierInvoice: dto.supplierInvoice,
          supplierChallan: dto.supplierChallan,
          vehicleNumber: dto.vehicleNumber,
          transport: dto.transport,
          receivingPerson: dto.receivingPerson,
          createdById: userId,
      };
      const grn = draftId
        ? await tx.goodsReceipt.update({
            where: { id: draftId },
            data: { ...grnData, draftPayload: Prisma.JsonNull },
          })
        : await tx.goodsReceipt.create({ data: grnData });

      for (const line of dto.lines) {
        if (!line.materialId) {
          throw new BadRequestException(
            'materialId required for GRN without PO',
          );
        }
        if (line.receivedQty <= 0) {
          throw new BadRequestException('Received qty must be positive');
        }
        const material = await tx.material.findFirst({
          where: { id: line.materialId, companyId },
        });
        if (!material) throw new BadRequestException('Invalid material');

        const batchNumber = await this.batchEngine.nextBatchNumber(
          companyId,
          new Date().getFullYear(),
          tx,
        );
        const barcode = this.batchEngine.barcodePayload(
          batchNumber,
          material.code,
        );

        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            materialId: material.id,
            goodsReceiptId: grn.id,
            batchNumber,
            supplierBatch: line.supplierBatch,
            manufacturingDate: line.manufacturingDate
              ? new Date(line.manufacturingDate)
              : null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            lotNumber: line.lotNumber,
            heatNumber: line.heatNumber,
            barcode,
            qrPayload: barcode,
          },
        });

        const qcRequired = resolveLineQcRequired(
          material.qcRequired,
          workflow.qcMode,
        );
        if (qcRequired) anyQc = true;

        const grnItem = await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: grn.id,
            purchaseOrderItemId: null,
            materialId: material.id,
            warehouseId: dto.warehouseId,
            locationId: dto.locationId,
            orderedQty: 0,
            receivedQty: line.receivedQty,
            damageQty: line.damageQty || 0,
            shortQty: line.shortQty || 0,
            excessQty: line.excessQty || 0,
            qcRequired,
            qcStatus: qcRequired ? 'pending' : 'waived',
            batchId: batch.id,
            supplierBatch: line.supplierBatch,
            manufacturingDate: line.manufacturingDate
              ? new Date(line.manufacturingDate)
              : null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            lotNumber: line.lotNumber,
            heatNumber: line.heatNumber,
          },
        });

        await this.putawayLine(
          {
            companyId,
            userId,
            grnId: grn.id,
            materialId: material.id,
            batchId: batch.id,
            warehouseId: dto.warehouseId,
            locationId: dto.locationId,
            receivedQty: line.receivedQty,
            damageQty: line.damageQty || 0,
            qcRequired,
          },
          tx,
        );

        await tx.batchTraceabilityLink.create({
          data: {
            companyId,
            linkType: 'grn_to_batch',
            fromBatchId: null,
            toBatchId: batch.id,
            referenceType: 'goods_receipt_item',
            referenceId: grnItem.id,
            meta: { grnId: grn.id, number },
          },
        });
      }

      const status = anyQc ? 'pending_qc' : 'approved';
      const readyForAccounts =
        workflow.accountsHandoffEnabled && status === 'approved';

      return tx.goodsReceipt.update({
        where: { id: grn.id },
        data: { status, readyForAccounts },
        include: {
          items: { include: { material: true, batch: true } },
          supplier: true,
          purchaseOrder: true,
        },
      });
    });
  }

  private async putawayLine(
    params: {
      companyId: string;
      userId: string;
      grnId: string;
      materialId: string;
      batchId: string;
      warehouseId: string;
      locationId?: string;
      receivedQty: number;
      damageQty: number;
      qcRequired: boolean;
      unitPrice?: number | null;
    },
    tx: Tx,
  ) {
    const putawayQty = params.receivedQty - params.damageQty;
    if (putawayQty > 0) {
      const status = params.qcRequired ? 'quality_hold' : 'available';
      await this.stock.add(
        {
          companyId: params.companyId,
          materialId: params.materialId,
          batchId: params.batchId,
          warehouseId: params.warehouseId,
          locationId: params.locationId,
          status,
        },
        putawayQty,
        {
          transactionType: params.qcRequired ? 'grn_qc_hold' : 'grn_in',
          referenceType: 'goods_receipt',
          referenceId: params.grnId,
          createdById: params.userId,
          notes:
            params.unitPrice != null
              ? `unitPrice=${params.unitPrice}`
              : undefined,
        },
        tx,
      );
    }

    if (params.damageQty > 0) {
      await this.stock.add(
        {
          companyId: params.companyId,
          materialId: params.materialId,
          batchId: params.batchId,
          warehouseId: params.warehouseId,
          locationId: params.locationId,
          status: 'damaged',
        },
        params.damageQty,
        {
          transactionType: 'grn_damage',
          referenceType: 'goods_receipt',
          referenceId: params.grnId,
          createdById: params.userId,
        },
        tx,
      );
    }
  }

  async applyQc(
    companyId: string,
    userId: string,
    dto: {
      goodsReceiptId: string;
      inspectedBy?: string;
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
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id: dto.goodsReceiptId, companyId },
      include: { items: true, supplier: true },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    if (grn.status !== 'pending_qc' && grn.status !== 'partial') {
      throw new BadRequestException('GRN is not pending QC');
    }

    const workflow = await this.loadWorkflow(companyId);

    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.series.next(companyId, 'qc_inspection', tx);

      const inspection = await tx.qcInspection.create({
        data: {
          companyId,
          goodsReceiptId: grn.id,
          number,
          inspectedBy: dto.inspectedBy,
        },
      });

      let totalInspected = 0;
      let totalAccepted = 0;
      let totalRejected = 0;

      for (const item of dto.items) {
        const grnItem = grn.items.find((i) => i.id === item.goodsReceiptItemId);
        if (!grnItem) {
          throw new BadRequestException('Invalid GRN item');
        }

        await tx.qcInspectionItem.create({
          data: {
            qcInspectionId: inspection.id,
            goodsReceiptItemId: grnItem.id,
            result: item.result,
            acceptedQty: item.acceptedQty,
            rejectedQty: item.rejectedQty,
            deviationQty: item.deviationQty || 0,
            reworkQty: item.reworkQty || 0,
            inspectionPct: item.inspectionPct,
            remarks: item.remarks,
          },
        });

        totalInspected += item.acceptedQty + item.rejectedQty;
        totalAccepted += item.acceptedQty;
        totalRejected += item.rejectedQty;

        await tx.goodsReceiptItem.update({
          where: { id: grnItem.id },
          data: {
            acceptedQty: (grnItem.acceptedQty || 0) + item.acceptedQty,
            rejectedQty: (grnItem.rejectedQty || 0) + item.rejectedQty,
            reworkQty: (grnItem.reworkQty || 0) + (item.reworkQty || 0),
            qcStatus:
              item.result === 'hold'
                ? 'hold'
                : item.result === 'rejected'
                  ? 'rejected'
                  : 'accepted',
          },
        });

        if (grnItem.batchId && item.acceptedQty > 0) {
          await this.stock.move(
            {
              companyId,
              materialId: grnItem.materialId,
              batchId: grnItem.batchId,
              warehouseId: grnItem.warehouseId,
              locationId: grnItem.locationId || undefined,
              status: 'quality_hold',
            },
            {
              warehouseId: grnItem.warehouseId,
              locationId: grnItem.locationId || undefined,
              status: 'available',
            },
            item.acceptedQty,
            {
              outType: 'qc_release',
              inType: 'qc_accept',
              referenceType: 'qc_inspection',
              referenceId: inspection.id,
              createdById: userId,
            },
            tx,
          );
        }

        if (grnItem.batchId && item.rejectedQty > 0) {
          await this.stock.move(
            {
              companyId,
              materialId: grnItem.materialId,
              batchId: grnItem.batchId,
              warehouseId: grnItem.warehouseId,
              locationId: grnItem.locationId || undefined,
              status: 'quality_hold',
            },
            {
              warehouseId: grnItem.warehouseId,
              locationId: grnItem.locationId || undefined,
              status: 'rejected',
            },
            item.rejectedQty,
            {
              outType: 'qc_release',
              inType: 'qc_reject',
              referenceType: 'qc_inspection',
              referenceId: inspection.id,
              createdById: userId,
            },
            tx,
          );
        }
      }

      const metrics = await tx.supplierQualityMetric.findFirst({
        where: { companyId, supplierId: grn.supplierId },
      });
      if (metrics && totalInspected > 0) {
        const accepted = metrics.acceptedQty + totalAccepted;
        const rejected = metrics.rejectedQty + totalRejected;
        const inspected = metrics.inspectedQty + totalInspected;
        const qualityPct = inspected > 0 ? (accepted / inspected) * 100 : 0;
        const rejectionPct = inspected > 0 ? (rejected / inspected) * 100 : 0;
        const ppm = inspected > 0 ? (rejected / inspected) * 1_000_000 : 0;
        await tx.supplierQualityMetric.update({
          where: { id: metrics.id },
          data: {
            inspectedQty: inspected,
            acceptedQty: accepted,
            rejectedQty: rejected,
            qualityPct,
            rejectionPct,
            ppm,
            complaintCount:
              metrics.complaintCount + (totalRejected > 0 ? 1 : 0),
          },
        });
      } else if (totalInspected > 0) {
        const qualityPct = (totalAccepted / totalInspected) * 100;
        const rejectionPct = (totalRejected / totalInspected) * 100;
        await tx.supplierQualityMetric.create({
          data: {
            companyId,
            supplierId: grn.supplierId,
            inspectedQty: totalInspected,
            acceptedQty: totalAccepted,
            rejectedQty: totalRejected,
            qualityPct,
            rejectionPct,
            ppm: (totalRejected / totalInspected) * 1_000_000,
            complaintCount: totalRejected > 0 ? 1 : 0,
          },
        });
      }

      const updatedItems = await tx.goodsReceiptItem.findMany({
        where: { goodsReceiptId: grn.id },
      });
      const pending = updatedItems.some(
        (i) => i.qcRequired && i.qcStatus === 'pending',
      );
      const anyRejected = updatedItems.some((i) => i.rejectedQty > 0);
      const anyAccepted = updatedItems.some((i) => i.acceptedQty > 0);

      let status: 'pending_qc' | 'approved' | 'rejected' | 'partial' | 'completed' =
        'pending_qc';
      if (!pending) {
        if (anyAccepted && anyRejected) status = 'partial';
        else if (anyAccepted) status = 'approved';
        else if (anyRejected) status = 'rejected';
        else status = 'completed';
      }

      const readyForAccounts =
        workflow.accountsHandoffEnabled &&
        (status === 'approved' || status === 'partial');

      return tx.goodsReceipt.update({
        where: { id: grn.id },
        data: {
          status,
          readyForAccounts,
        },
        include: {
          items: { include: { material: true, batch: true } },
        },
      });
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'store.qc.applied',
      entityType: 'goods_receipt',
      entityId: result.id,
      meta: { number: result.number, status: result.status },
    });

    return result;
  }
}
