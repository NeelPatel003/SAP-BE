import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { CompaniesService } from '../companies/companies.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
} from '../companies/dto/company.dto';
import { UsageMeterService } from '../usage/usage-meter.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { BillingSettingsDto } from '../company-settings/dto/company-settings.dto';
import { IndustryTemplateService } from '../companies/industry-templates';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly companies: CompaniesService,
    private readonly audit: AuditService,
    private readonly usage: UsageMeterService,
    private readonly companySettings: CompanySettingsService,
    private readonly industryTemplates: IndustryTemplateService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('admin.dashboard.read')
  @ApiOperation({ summary: 'Platform dashboard KPIs' })
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('companies')
  @RequirePermissions('admin.companies.read')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'List companies' })
  listCompanies(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.companies.findAll(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      search,
    );
  }

  @Post('companies')
  @RequirePermissions('admin.companies.write')
  @ApiOperation({ summary: 'Register company + first company admin' })
  createCompany(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    return this.companies.create(dto, { id: user.id, ip });
  }

  @Get('companies/:id')
  @RequirePermissions('admin.companies.read')
  @ApiOperation({ summary: 'Company detail' })
  getCompany(@Param('id') id: string) {
    return this.companies.findOne(id);
  }

  @Patch('companies/:id')
  @RequirePermissions('admin.companies.write')
  @ApiOperation({ summary: 'Update company status/modules/plan' })
  updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    return this.companies.update(id, dto, { id: user.id, ip });
  }

  @Get('activity')
  @RequirePermissions('admin.logs.read')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOperation({ summary: 'Activity logs' })
  activity(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('companyId') companyId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.listActivity({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      companyId,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('audit')
  @RequirePermissions('admin.logs.read')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'event', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOperation({ summary: 'Security audit trail' })
  auditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('companyId') companyId?: string,
    @Query('userId') userId?: string,
    @Query('event') event?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.listAudit({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      companyId,
      userId,
      event,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('api-usage')
  @RequirePermissions('admin.logs.read')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOperation({ summary: 'API usage aggregates and recent calls' })
  apiUsage(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.apiUsage({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      companyId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('companies/:id/usage')
  @RequirePermissions('admin.logs.read')
  @ApiOperation({ summary: 'Feature usage (AI/email/PDF) for a company' })
  companyUsage(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usage.companyUsage(id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
  }

  @Patch('companies/:id/billing')
  @RequirePermissions('admin.companies.write')
  @ApiOperation({ summary: 'Update company billing/AI entitlements' })
  patchBilling(
    @Param('id') id: string,
    @Body() body: BillingSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.companySettings.platformPatchBilling(id, user.id, body);
  }

  @Get('modules')
  @RequirePermissions('admin.companies.read')
  @ApiOperation({ summary: 'Catalog of platform modules' })
  listModules() {
    return this.admin.listModules();
  }

  @Get('industry-templates')
  @RequirePermissions('admin.companies.read')
  @ApiOperation({ summary: 'Industry starter packs' })
  industryTemplatesList() {
    return this.industryTemplates.list();
  }
}
