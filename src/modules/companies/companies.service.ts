import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { DocumentSeriesService } from '../company-settings/document-series.service';
import {
  IndustryTemplateCode,
  IndustryTemplateService,
} from './industry-templates';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly series: DocumentSeriesService,
    private readonly industryTemplates: IndustryTemplateService,
  ) {}

  async create(
    dto: CreateCompanyDto,
    actor: { id: string; ip?: string | null },
  ) {
    const existingSlug = await this.prisma.company.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug) {
      throw new ConflictException('Company slug already exists');
    }

    const email = dto.adminEmail.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Admin email already in use');
    }

    const companyAdminRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'COMPANY_ADMIN' },
    });

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
    const modules =
      dto.industryTemplate != null
        ? []
        : (dto.enabledModules ?? ([] as string[]));

    const company = await this.prisma.$transaction(async (tx: PrismaService) => {
      const created = await tx.company.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          status: dto.status ?? 'trial',
          enabledModules: modules as object,
          plan: dto.plan ?? null,
        },
      });

      const admin = await tx.user.create({
        data: {
          email,
          name: dto.adminName,
          passwordHash,
          companyId: created.id,
          status: 'active',
        },
      });

      await tx.userRole.create({
        data: { userId: admin.id, roleId: companyAdminRole.id },
      });

      return { company: created, admin };
    });

    await this.series.ensureDefaults(company.company.id);

    if (dto.industryTemplate) {
      await this.industryTemplates.apply(
        company.company.id,
        dto.industryTemplate as IndustryTemplateCode,
      );
    }

    const finalCompany = await this.prisma.company.findUniqueOrThrow({
      where: { id: company.company.id },
    });

    await this.audit.writeAudit({
      event: 'company_created',
      success: true,
      userId: actor.id,
      companyId: company.company.id,
      ip: actor.ip,
      meta: {
        companyName: company.company.name,
        adminEmail: email,
        industryTemplate: dto.industryTemplate || null,
      },
    });

    await this.audit.writeActivity({
      action: 'company.created',
      entityType: 'company',
      entityId: company.company.id,
      userId: actor.id,
      companyId: company.company.id,
      ip: actor.ip,
      meta: {
        name: company.company.name,
        slug: company.company.slug,
        industryTemplate: dto.industryTemplate || null,
      },
    });

    return {
      ...finalCompany,
      admin: {
        id: company.admin.id,
        email: company.admin.email,
        name: company.admin.name,
      },
      industryTemplate: dto.industryTemplate || null,
    };
  }

  async findAll(page = 1, pageSize = 20, search?: string) {
    const where: {
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        slug?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { users: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            lastLoginAt: true,
            userRoles: { include: { role: { select: { code: true, name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { users: true } },
      },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    const settings =
      company.settings && typeof company.settings === 'object'
        ? (company.settings as { industryTemplate?: string })
        : {};
    return {
      ...company,
      industryTemplate: settings.industryTemplate || null,
    };
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    actor: { id: string; ip?: string | null },
  ) {
    await this.findOne(id);

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        name: dto.name,
        status: dto.status,
        enabledModules: dto.enabledModules,
        plan: dto.plan,
      },
    });

    await this.audit.writeAudit({
      event: 'company_updated',
      success: true,
      userId: actor.id,
      companyId: id,
      ip: actor.ip,
      meta: { ...dto },
    });

    await this.audit.writeActivity({
      action: 'company.updated',
      entityType: 'company',
      entityId: id,
      userId: actor.id,
      companyId: id,
      ip: actor.ip,
      meta: { ...dto },
    });

    return updated;
  }
}
