import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  ModuleEnabledGuard,
  RequireModule,
} from '../../common/guards/module-enabled.guard';
import { requireCompanyId } from '../../common/utils/tenant';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { StoreMastersService } from './store-masters.service';
import { GrnService } from './grn.service';
import { IssueService } from './issue.service';
import { StoreQueryService } from './store-query.service';
import { ReservationEngine } from './engines/reservation.engine';
import { TraceabilityEngine } from './engines/traceability.engine';
import { PrismaService } from '../prisma/prisma.service';
import { UsageMeterService } from '../usage/usage-meter.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { buildSimplePdf } from '../../common/utils/simple-pdf';
import { SerialService } from './serial.service';
import {
  ApplyQcDto,
  CreateGrnDto,
  CreateIssueDto,
  CreateMaterialDto,
  CreateReservationDto,
  CreateReturnDto,
  CreateSerialsDto,
  CreateTransferDto,
  CreateUnitDto,
  UpdateUnitDto,
  UpdateMaterialDto,
  StockVerificationDto,
} from './dto/store.dto';

@ApiTags('store')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('store')
@Controller('store')
export class StoreController {
  constructor(
    private readonly masters: StoreMastersService,
    private readonly grn: GrnService,
    private readonly issues: IssueService,
    private readonly query: StoreQueryService,
    private readonly reservations: ReservationEngine,
    private readonly trace: TraceabilityEngine,
    private readonly prisma: PrismaService,
    private readonly meter: UsageMeterService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly serials: SerialService,
  ) {}

  // --- masters ---
  @Get('units')
  @RequirePermissions('store.masters.read')
  units() {
    return this.masters.listUnits();
  }

  @Post('units')
  @RequirePermissions('store.masters.write')
  createUnit(@Body() body: CreateUnitDto) {
    return this.masters.createUnit(body);
  }

  @Patch('units/:id')
  @RequirePermissions('store.masters.write')
  updateUnit(@Param('id') id: string, @Body() body: UpdateUnitDto) {
    return this.masters.updateUnit(id, body);
  }

  @Get('categories')
  @RequirePermissions('store.masters.read')
  categories(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.masters.listCategories(requireCompanyId(user), q);
  }

  @Post('categories')
  @RequirePermissions('store.masters.write')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body() body: { code: string; name: string; description?: string },
  ) {
    return this.masters.createCategory(requireCompanyId(user), body);
  }

  @Get('materials')
  @RequirePermissions('store.masters.read')
  materials(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.masters.listMaterials(requireCompanyId(user), q);
  }

  @Post('materials')
  @RequirePermissions('store.masters.write')
  createMaterial(@CurrentUser() user: AuthUser, @Body() body: CreateMaterialDto) {
    return this.masters.createMaterial(requireCompanyId(user), body);
  }

  @Get('materials/:id')
  @RequirePermissions('store.masters.read')
  material(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.masters.getMaterial(requireCompanyId(user), id);
  }

  @Patch('materials/:id')
  @RequirePermissions('store.masters.write')
  updateMaterial(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateMaterialDto,
  ) {
    return this.masters.updateMaterial(requireCompanyId(user), id, body);
  }

  @Get('warehouses')
  @RequirePermissions('store.masters.read')
  warehouses(@CurrentUser() user: AuthUser) {
    return this.masters.listWarehouses(requireCompanyId(user));
  }

  @Post('warehouses')
  @RequirePermissions('store.masters.write')
  createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() body: { code: string; name: string; address?: string },
  ) {
    return this.masters.createWarehouse(requireCompanyId(user), body);
  }

  @Post('locations')
  @RequirePermissions('store.masters.write')
  createLocation(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      warehouseId: string;
      parentId?: string;
      type: 'ZONE' | 'RACK' | 'SHELF' | 'BIN';
      code: string;
      name: string;
    },
  ) {
    return this.masters.createLocation(requireCompanyId(user), body);
  }

  @Get('purchase-orders')
  @RequirePermissions('store.grn.read')
  purchaseOrders(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.masters.listPurchaseOrders(requireCompanyId(user), q);
  }

  @Get('purchase-orders/:id')
  @RequirePermissions('store.grn.read')
  purchaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.masters.getPurchaseOrder(requireCompanyId(user), id);
  }

  @Get('production-orders')
  @RequirePermissions('store.issue.create')
  productionOrders(@CurrentUser() user: AuthUser) {
    return this.masters.listProductionOrders(requireCompanyId(user));
  }

  @Get('suppliers')
  @RequirePermissions('store.masters.read')
  suppliers(@CurrentUser() user: AuthUser) {
    return this.masters.listSuppliers(requireCompanyId(user));
  }

  // --- GRN ---
  @Get('grn')
  @RequirePermissions('store.grn.read')
  listGrn(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { status?: string },
  ) {
    return this.grn.list(requireCompanyId(user), q);
  }

  @Get('grn/:id')
  @RequirePermissions('store.grn.read')
  getGrn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.grn.get(requireCompanyId(user), id);
  }

  @Post('grn')
  @RequirePermissions('store.grn.create', 'store.grn.post')
  async createGrn(@CurrentUser() user: AuthUser, @Body() body: CreateGrnDto) {
    const companyId = requireCompanyId(user);
    const result = await this.grn.createAndPost(
      companyId,
      user.id,
      user.permissions || [],
      body,
    );
    await this.notifyGrnPosted(companyId, user.id, result);
    return result;
  }

  @Post('grn/draft')
  @RequirePermissions('store.grn.create')
  createGrnDraft(@CurrentUser() user: AuthUser, @Body() body: CreateGrnDto) {
    return this.grn.createDraft(requireCompanyId(user), user.id, body);
  }

  @Post('grn/:id/post')
  @RequirePermissions('store.grn.post')
  async postGrnDraft(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const companyId = requireCompanyId(user);
    const result = await this.grn.postDraft(
      companyId,
      user.id,
      user.permissions || [],
      id,
    );
    await this.notifyGrnPosted(companyId, user.id, result);
    return result;
  }

  private async notifyGrnPosted(
    companyId: string,
    actorUserId: string,
    result: { id: string; number: string; status: string },
  ) {
    try {
      await this.notifications.notifyCompanyUsersWithPermission(
        companyId,
        'store.grn.read',
        {
          type: 'grn.posted',
          title: `GRN ${result.number} posted`,
          body: `Status: ${result.status}`,
          link: `/dashboard/store/grn?id=${result.id}`,
          meta: { grnId: result.id },
        },
      );
      if (result.status === 'pending_qc') {
        await this.notifications.notifyCompanyUsersWithPermission(
          companyId,
          'qc.queue.read',
          {
            type: 'grn.pending_qc',
            title: `GRN ${result.number} awaiting QC`,
            body: 'Goods receipt is on quality hold',
            link: `/dashboard/qc?grnId=${result.id}`,
            meta: { grnId: result.id },
          },
        );
        await this.notifications.notifyCompanyUsersWithPermission(
          companyId,
          'qc.inspect',
          {
            type: 'grn.pending_qc',
            title: `GRN ${result.number} awaiting QC`,
            body: 'Goods receipt is on quality hold',
            link: `/dashboard/qc?grnId=${result.id}`,
            meta: { grnId: result.id },
          },
        );
      }
      const readers = await this.prisma.user.findMany({
        where: {
          companyId,
          status: 'active',
          userRoles: {
            some: {
              role: {
                rolePermissions: {
                  some: { permission: { code: 'store.grn.read' } },
                },
              },
            },
          },
        },
        select: { id: true, email: true },
        take: 20,
      });
      for (const u of readers) {
        try {
          await this.email.send({
            companyId,
            userId: actorUserId,
            to: u.email,
            subject: `GRN ${result.number} posted`,
            body: `Goods receipt ${result.number} was posted (status ${result.status}).`,
          });
        } catch {
          // entitlement off or quota — skip
        }
      }
    } catch {
      // non-blocking side effects
    }
  }

  @Get('labels/batches')
  @RequirePermissions('store.grn.read')
  async batchLabels(
    @CurrentUser() user: AuthUser,
    @Query('grnId') grnId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const companyId = requireCompanyId(user);
    if (batchId) {
      const b = await this.prisma.inventoryBatch.findFirst({
        where: { id: batchId, companyId },
        include: { material: true },
      });
      return b ? [b] : [];
    }
    if (grnId) {
      return this.prisma.inventoryBatch.findMany({
        where: { companyId, goodsReceiptId: grnId },
        include: { material: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.inventoryBatch.findMany({
      where: { companyId },
      include: { material: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Get('reports/pack.pdf')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @RequirePermissions('store.reports.read')
  async reportPackPdf(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('kind') kind?: string,
  ) {
    const companyId = requireCompanyId(user);
    await this.meter.assertWithinQuota(companyId, 'report.pdf', 1);
    const reportKind = kind === 'grn' ? 'grn' : 'stock';
    const lines: string[] = [];
    if (reportKind === 'grn') {
      const list = await this.grn.list(companyId, { page: 1, pageSize: 100 });
      lines.push('GRN number | status | supplier');
      for (const g of list.items as {
        number: string;
        status: string;
        supplier?: { name?: string };
      }[]) {
        lines.push(
          `${g.number} | ${g.status} | ${g.supplier?.name || '-'}`,
        );
      }
    } else {
      const stock = await this.query.listStock(companyId, {
        page: 1,
        pageSize: 200,
      });
      lines.push('Material | batch | qty | status');
      for (const s of stock.items as {
        material?: { code?: string };
        batch?: { batchNumber?: string };
        quantity: number;
        status: string;
      }[]) {
        lines.push(
          `${s.material?.code || '-'} | ${s.batch?.batchNumber || '-'} | ${s.quantity} | ${s.status}`,
        );
      }
    }
    const pdf = buildSimplePdf(
      `Teamora ${reportKind} report`,
      lines,
    );
    await this.meter.record({
      companyId,
      userId: user.id,
      feature: 'report.pdf',
      inputUnits: 1,
      meta: { kind: reportKind },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${reportKind}-report.pdf`,
    );
    res.send(pdf);
  }

  @Post('qc/apply')
  @RequirePermissions('store.qc.receive')
  applyQc(@CurrentUser() user: AuthUser, @Body() body: ApplyQcDto) {
    return this.grn.applyQc(requireCompanyId(user), user.id, body);
  }

  // --- stock ---
  @Get('batches/by-barcode')
  @RequirePermissions('store.stock.read')
  batchByBarcode(
    @CurrentUser() user: AuthUser,
    @Query('code') code: string,
  ) {
    return this.query.findBatchByBarcode(requireCompanyId(user), code);
  }

  @Get('verification')
  verificationHistory(@CurrentUser() user: AuthUser) {
    if (
      !user.permissions.some((p) =>
        ['store.stock.read', 'store.reports.read'].includes(p),
      )
    ) {
      throw new ForbiddenException('Stock or report read permission required');
    }
    return this.query.verificationHistory(requireCompanyId(user));
  }

  @Post('verification')
  verifyStock(
    @CurrentUser() user: AuthUser,
    @Body() body: StockVerificationDto,
  ) {
    if (
      !user.permissions.some((p) =>
        ['store.stock.read', 'store.reports.read'].includes(p),
      )
    ) {
      throw new ForbiddenException('Stock or report read permission required');
    }
    return this.query.verifyStock(requireCompanyId(user), user.id, body);
  }
  @Get('dashboard')
  @RequirePermissions('store.dashboard.read')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.query.dashboard(requireCompanyId(user));
  }

  @Get('stock')
  @RequirePermissions('store.stock.read')
  stock(
    @CurrentUser() user: AuthUser,
    @Query()
    q: PaginationQueryDto & {
      status?: string;
      warehouseId?: string;
      materialId?: string;
    },
  ) {
    return this.query.listStock(requireCompanyId(user), q);
  }

  @Get('ledger')
  @RequirePermissions('store.reports.read')
  ledger(
    @CurrentUser() user: AuthUser,
    @Query()
    q: PaginationQueryDto & { materialId?: string; batchId?: string },
  ) {
    return this.query.ledger(requireCompanyId(user), q);
  }

  @Get('ledger.csv')
  @RequirePermissions('store.reports.read')
  async ledgerCsv(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { materialId?: string },
    @Res() res: Response,
  ) {
    const data = await this.query.ledger(requireCompanyId(user), {
      ...q,
      pageSize: 1000,
    });
    const csv = this.query.ledgerCsv(data.items);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=stock-ledger.csv');
    res.send(csv);
  }

  @Get('reports/stock.csv')
  @RequirePermissions('store.reports.read')
  async stockCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.query.stockCsv(requireCompanyId(user));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=warehouse-stock.csv',
    );
    res.send(csv);
  }

  @Get('reports/grn.csv')
  @RequirePermissions('store.reports.read')
  async grnCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.query.grnRegisterCsv(requireCompanyId(user));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=grn-register.csv',
    );
    res.send(csv);
  }

  @Get('reports/issues.csv')
  @RequirePermissions('store.reports.read')
  async issuesCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.query.issueRegisterCsv(requireCompanyId(user));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=issue-register.csv',
    );
    res.send(csv);
  }

  @Get('reports/valuation.csv')
  @RequirePermissions('store.reports.read')
  async valuationCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.query.valuationCsv(requireCompanyId(user));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=inventory-valuation.csv',
    );
    res.send(csv);
  }

  @Get('aging')
  @RequirePermissions('store.reports.read')
  aging(@CurrentUser() user: AuthUser) {
    return this.query.getAging(requireCompanyId(user));
  }

  @Get('reports/:kind.csv')
  @RequirePermissions('store.reports.read')
  async extendedReportCsv(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Res() res: Response,
  ) {
    const csv = await this.query.reportCsv(requireCompanyId(user), kind);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${kind.replace(/[^a-z0-9-]/gi, '')}.csv`,
    );
    res.send(csv);
  }

  @Get('fifo/suggest')
  @RequirePermissions('store.stock.read')
  fifoSuggest(
    @CurrentUser() user: AuthUser,
    @Query('materialId') materialId: string,
    @Query('quantity') quantity: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.issues.suggestFifo(
      requireCompanyId(user),
      materialId,
      parseFloat(quantity),
      warehouseId,
      status,
    );
  }

  // --- issues ---
  @Get('issues')
  @RequirePermissions('store.stock.read')
  listIssues(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.issues.listIssues(requireCompanyId(user), q);
  }

  @Post('issues')
  @RequirePermissions('store.issue.create')
  async createIssue(@CurrentUser() user: AuthUser, @Body() body: CreateIssueDto) {
    const companyId = requireCompanyId(user);
    const lines = await Promise.all(
      body.lines.map(async (line) => {
        if (line.batchId) return { ...line, batchId: line.batchId };
        if (!line.barcode) {
          throw new BadRequestException('batchId or barcode required');
        }
        const batch = await this.query.findBatchByBarcode(companyId, line.barcode);
        if (!batch) throw new BadRequestException(`Batch not found: ${line.barcode}`);
        if (batch.materialId !== line.materialId) {
          throw new BadRequestException('Scanned batch does not match material');
        }
        return { ...line, batchId: batch.id };
      }),
    );
    return this.issues.createIssue(
      companyId,
      user.id,
      user.permissions,
      { ...body, lines },
    );
  }

  @Get('serials')
  @RequirePermissions('store.serial.read')
  listSerials(
    @CurrentUser() user: AuthUser,
    @Query()
    q: PaginationQueryDto & {
      materialId?: string;
      batchId?: string;
      status?: string;
    },
  ) {
    return this.serials.list(requireCompanyId(user), q);
  }

  @Post('serials')
  @RequirePermissions('store.serial.write')
  createSerials(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSerialsDto,
  ) {
    return this.serials.createMany(requireCompanyId(user), body);
  }

  @Get('returns')
  @RequirePermissions('store.return.create')
  listReturns(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.issues.listReturns(requireCompanyId(user), q);
  }

  @Post('returns')
  @RequirePermissions('store.return.create')
  createReturn(@CurrentUser() user: AuthUser, @Body() body: CreateReturnDto) {
    return this.issues.createReturn(requireCompanyId(user), user.id, body);
  }

  @Get('transfers')
  @RequirePermissions('store.transfer.create')
  listTransfers(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.issues.listTransfers(requireCompanyId(user), q);
  }

  @Post('transfers')
  @RequirePermissions('store.transfer.create')
  async createTransfer(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTransferDto,
  ) {
    const companyId = requireCompanyId(user);
    const lines = await Promise.all(
      body.lines.map(async (line) => {
        if (line.batchId) return { ...line, batchId: line.batchId };
        if (!line.barcode) throw new BadRequestException('batchId or barcode required');
        const batch = await this.query.findBatchByBarcode(companyId, line.barcode);
        if (!batch) throw new BadRequestException(`Batch not found: ${line.barcode}`);
        if (batch.materialId !== line.materialId) {
          throw new BadRequestException('Scanned batch does not match material');
        }
        return { ...line, batchId: batch.id };
      }),
    );
    return this.issues.createTransfer(companyId, user.id, { ...body, lines });
  }

  // --- reservations ---
  @Get('reservations')
  @RequirePermissions('store.reservation.read')
  listReservations(@CurrentUser() user: AuthUser) {
    return this.prisma.planningReservation.findMany({
      where: { companyId: requireCompanyId(user) },
      include: { material: true, batch: true, productionOrder: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('reservations')
  @RequirePermissions('store.reservation.write')
  createReservation(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateReservationDto,
  ) {
    return this.reservations.create({
      companyId: requireCompanyId(user),
      materialId: body.materialId,
      quantity: body.quantity,
      productionOrderId: body.productionOrderId,
      productionDate: body.productionDate
        ? new Date(body.productionDate)
        : undefined,
      priority: body.priority,
      notes: body.notes,
      batchId: body.batchId,
      warehouseId: body.warehouseId,
    });
  }

  @Post('reservations/:id/release')
  @RequirePermissions('store.reservation.write')
  releaseReservation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservations.release(requireCompanyId(user), id);
  }

  @Get('traceability/batches/:id')
  @RequirePermissions('store.stock.read')
  traceBatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('direction') direction?: 'forward' | 'backward',
  ) {
    return this.trace.getBatchTrace(
      requireCompanyId(user),
      id,
      direction || 'forward',
    );
  }
}
