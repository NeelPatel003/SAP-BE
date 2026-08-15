import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentSeriesService } from './document-series.service';
import {
  DOC_TYPES,
  DOCUMENT_SERIES_CATALOG,
  DocType,
} from './document-series.catalog';
import {
  BillingSettingsDto,
  CompanyStoreSettingsDto,
  PatchCompanySettingsDto,
  PutDocumentSeriesDto,
  WorkflowSettingsDto,
} from './dto/company-settings.dto';
import {
  CompanySettingsBlob,
  DEFAULT_BILLING,
  DEFAULT_WORKFLOW,
  parseSettingsBlob,
  resolveBilling,
  resolveWorkflow,
} from '../../common/workflow/company-workflow';

@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly series: DocumentSeriesService,
  ) {}

  async getSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    return this.serializeSettings(company);
  }

  async getRawSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company.settings;
  }

  private serializeSettings(company: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    taxId: string | null;
    phone: string | null;
    address: string | null;
    currency: string;
    timezone: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    displayName: string | null;
    settings: unknown;
  }) {
    const blob = parseSettingsBlob(company.settings);
    const workflow = resolveWorkflow(company.settings);
    const billing = resolveBilling(company.settings);

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      legalName: company.legalName,
      taxId: company.taxId,
      phone: company.phone,
      address: company.address,
      currency: company.currency || 'INR',
      timezone: company.timezone || 'Asia/Kolkata',
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor || '#f97316',
      secondaryColor: company.secondaryColor || '#0f172a',
      displayName: company.displayName || company.name,
      layoutDensity:
        blob.layoutDensity === 'compact' ? 'compact' : 'comfortable',
      store: {
        defaultWarehouseId: blob.defaultWarehouseId ?? null,
        defaultQcRequired: blob.defaultQcRequired ?? true,
        layoutDensity:
          blob.layoutDensity === 'compact' ? 'compact' : 'comfortable',
      },
      workflow,
      billing,
    };
  }

  async updateSettings(
    companyId: string,
    userId: string,
    body: PatchCompanySettingsDto,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    let blob: CompanySettingsBlob = {
      ...parseSettingsBlob(company.settings),
    };
    const storePatch = body.store as CompanyStoreSettingsDto | undefined;
    const density = body.layoutDensity ?? storePatch?.layoutDensity;

    let settingsTouched =
      body.layoutDensity !== undefined ||
      body.store !== undefined ||
      body.workflow !== undefined ||
      body.billing !== undefined;

    if (storePatch) {
      if (storePatch.defaultWarehouseId) {
        const wh = await this.prisma.warehouse.findFirst({
          where: { id: storePatch.defaultWarehouseId, companyId },
        });
        if (!wh) {
          throw new BadRequestException('Invalid default warehouse');
        }
        blob.defaultWarehouseId = wh.id;
      } else if (storePatch.defaultWarehouseId === null) {
        blob.defaultWarehouseId = null;
      }
      if (typeof storePatch.defaultQcRequired === 'boolean') {
        blob.defaultQcRequired = storePatch.defaultQcRequired;
      }
    }

    if (density !== undefined) {
      if (density !== 'comfortable' && density !== 'compact') {
        throw new BadRequestException(
          'layoutDensity must be comfortable or compact',
        );
      }
      blob.layoutDensity = density;
      settingsTouched = true;
    }

    if (body.workflow) {
      const w = body.workflow as WorkflowSettingsDto;
      blob.workflow = {
        ...DEFAULT_WORKFLOW,
        ...blob.workflow,
        ...w,
      };
    }

    if (body.billing) {
      const b = body.billing as BillingSettingsDto;
      blob.billing = {
        ...DEFAULT_BILLING,
        ...blob.billing,
        ...b,
      };
    }

    if (body.primaryColor != null && body.primaryColor !== '') {
      if (!/^#[0-9A-Fa-f]{6}$/.test(body.primaryColor)) {
        throw new BadRequestException('primaryColor must be #RRGGBB');
      }
    }
    if (body.secondaryColor != null && body.secondaryColor !== '') {
      if (!/^#[0-9A-Fa-f]{6}$/.test(body.secondaryColor)) {
        throw new BadRequestException('secondaryColor must be #RRGGBB');
      }
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.legalName !== undefined ? { legalName: body.legalName } : {}),
        ...(body.taxId !== undefined ? { taxId: body.taxId } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.currency !== undefined
          ? { currency: body.currency.trim() || 'INR' }
          : {}),
        ...(body.timezone !== undefined
          ? { timezone: body.timezone.trim() || 'Asia/Kolkata' }
          : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl || null } : {}),
        ...(body.primaryColor !== undefined
          ? { primaryColor: body.primaryColor || null }
          : {}),
        ...(body.secondaryColor !== undefined
          ? { secondaryColor: body.secondaryColor || null }
          : {}),
        ...(body.displayName !== undefined
          ? { displayName: body.displayName || null }
          : {}),
        ...(settingsTouched ? { settings: blob as object } : {}),
      },
    });

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'company.settings.updated',
      entityType: 'company',
      entityId: companyId,
    });

    return this.serializeSettings(updated);
  }

  /**
   * Platform admin may patch billing entitlements without company.settings.write.
   */
  async platformPatchBilling(
    companyId: string,
    actorId: string,
    billing: BillingSettingsDto,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    const blob: CompanySettingsBlob = {
      ...parseSettingsBlob(company.settings),
      billing: {
        ...DEFAULT_BILLING,
        ...parseSettingsBlob(company.settings).billing,
        ...billing,
      },
    };
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { settings: blob as object },
    });
    await this.audit.writeActivity({
      companyId,
      userId: actorId,
      action: 'company.billing.updated',
      entityType: 'company',
      entityId: companyId,
      meta: { ...(billing as object) } as Record<string, unknown>,
    });
    return this.serializeSettings(updated);
  }

  async listSeries(companyId: string) {
    await this.series.ensureDefaults(companyId);
    const rows = await this.prisma.documentSeries.findMany({
      where: { companyId },
      orderBy: { docType: 'asc' },
    });
    const labelByType = Object.fromEntries(
      DOCUMENT_SERIES_CATALOG.map((c) => [c.docType, c.label]),
    );

    return rows.map((r) => ({
      id: r.id,
      docType: r.docType,
      label: labelByType[r.docType] || r.docType,
      prefix: r.prefix,
      includeYear: r.includeYear,
      padLength: r.padLength,
      resetPolicy: r.resetPolicy,
      preview: this.series.previewNext(r),
    }));
  }

  async replaceSeries(
    companyId: string,
    userId: string,
    dto: PutDocumentSeriesDto,
  ) {
    const items = dto.items || [];
    if (!items.length) {
      throw new BadRequestException('items required');
    }

    await this.series.ensureDefaults(companyId);

    for (const item of items) {
      if (!DOC_TYPES.includes(item.docType as DocType)) {
        throw new BadRequestException(`Invalid docType: ${item.docType}`);
      }
      const prefix = (item.prefix || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
      if (!prefix || prefix.length > 20) {
        throw new BadRequestException(
          `Invalid prefix for ${item.docType} (1–20 chars)`,
        );
      }
      const pad = item.padLength !== undefined ? Number(item.padLength) : 5;
      if (pad < 1 || pad > 10 || !Number.isInteger(pad)) {
        throw new BadRequestException('padLength must be 1–10');
      }
      const reset = item.resetPolicy || 'yearly';
      if (reset !== 'yearly' && reset !== 'never') {
        throw new BadRequestException('resetPolicy must be yearly or never');
      }

      await this.prisma.documentSeries.update({
        where: {
          companyId_docType: { companyId, docType: item.docType },
        },
        data: {
          prefix,
          includeYear: item.includeYear !== false,
          padLength: pad,
          resetPolicy: reset,
        },
      });
    }

    await this.audit.writeActivity({
      companyId,
      userId,
      action: 'company.document_series.updated',
      entityType: 'company',
      entityId: companyId,
      meta: { count: items.length },
    });

    return this.listSeries(companyId);
  }
}
