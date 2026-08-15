import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import {
  CreateCompanyUserDto,
  ListCompanyUsersQueryDto,
  UpdateCompanyUserDto,
} from './dto/company-users.dto';
import { paginatedResult } from '../../common/dto/pagination.dto';

const COMPANY_ADMIN_CODE = 'COMPANY_ADMIN';

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private serializeUser(user: {
    id: string;
    email: string;
    name: string;
    status: string;
    companyId: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: {
      role: { id: string; code: string; name: string; scope: string };
    }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      companyId: user.companyId,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        code: ur.role.code,
        name: ur.role.name,
      })),
    };
  }

  private userInclude() {
    return {
      userRoles: {
        include: {
          role: { select: { id: true, code: true, name: true, scope: true } },
        },
      },
    } as const;
  }

  async listAssignableRoles() {
    return this.prisma.role.findMany({
      where: { scope: 'COMPANY' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async list(companyId: string, q: ListCompanyUsersQueryDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize =
      q.pageSize && q.pageSize > 0 ? Math.min(q.pageSize, 100) : 20;
    const search = q.search?.trim();

    const where = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: this.userInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginatedResult(
      items.map((u) => this.serializeUser(u)),
      total,
      page,
      pageSize,
    );
  }

  async get(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: this.userInclude(),
    });
    if (!user) throw new NotFoundException('User not found');
    return this.serializeUser(user);
  }

  private async resolveRoleIds(roleIds?: string[]): Promise<string[]> {
    if (!roleIds?.length) {
      const member = await this.prisma.role.findUnique({
        where: { code: 'COMPANY_MEMBER' },
      });
      if (!member) throw new BadRequestException('COMPANY_MEMBER role missing');
      return [member.id];
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles not found');
    }
    for (const r of roles) {
      if (r.scope !== 'COMPANY' || r.code === 'PLATFORM_SUPER_ADMIN') {
        throw new ForbiddenException(
          `Role ${r.code} cannot be assigned to company users`,
        );
      }
    }
    return roles.map((r) => r.id);
  }

  private async countActiveCompanyAdmins(
    companyId: string,
    excludeUserId?: string,
  ) {
    return this.prisma.user.count({
      where: {
        companyId,
        status: 'active',
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        userRoles: { some: { role: { code: COMPANY_ADMIN_CODE } } },
      },
    });
  }

  private async assertNotLastAdmin(
    companyId: string,
    targetUserId: string,
    nextRoleIds: string[] | null,
    nextStatus: string | null,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, companyId },
      include: {
        userRoles: { include: { role: true } },
      },
    });
    if (!target) throw new NotFoundException('User not found');

    const isAdminNow = target.userRoles.some(
      (ur) => ur.role.code === COMPANY_ADMIN_CODE,
    );
    if (!isAdminNow || target.status !== 'active') return;

    let remainsAdmin = true;
    let remainsActive = true;

    if (nextStatus) {
      remainsActive = nextStatus === 'active';
    }
    if (nextRoleIds) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: nextRoleIds } },
      });
      remainsAdmin = roles.some((r) => r.code === COMPANY_ADMIN_CODE);
    }

    if (!remainsAdmin || !remainsActive) {
      const others = await this.countActiveCompanyAdmins(
        companyId,
        targetUserId,
      );
      if (others < 1) {
        throw new BadRequestException(
          'Cannot remove or deactivate the last active company admin',
        );
      }
    }
  }

  async create(
    companyId: string,
    dto: CreateCompanyUserDto,
    actor: { id: string; ip?: string | null },
  ) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const roleIds = await this.resolveRoleIds(dto.roleIds);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          passwordHash,
          companyId,
          status: 'active',
        },
      });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: created.id, roleId })),
      });
      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: this.userInclude(),
      });
    });

    await this.audit.writeActivity({
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      userId: actor.id,
      companyId,
      ip: actor.ip,
      meta: { email, roleIds },
    });
    await this.audit.writeAudit({
      event: 'user.created',
      success: true,
      userId: actor.id,
      companyId,
      ip: actor.ip,
      meta: { targetUserId: user.id, email },
    });

    try {
      await this.email.send({
        companyId,
        userId: actor.id,
        to: email,
        subject: 'Welcome to Teamora',
        body: `Hello ${dto.name.trim()}, your Teamora account was created. Sign in with this email.`,
      });
    } catch {
      // email entitlement or quota may block send
    }

    return this.serializeUser(user);
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateCompanyUserDto,
    actor: { id: string; ip?: string | null },
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: this.userInclude(),
    });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.roleIds !== undefined || dto.status !== undefined) {
      await this.assertNotLastAdmin(
        companyId,
        id,
        dto.roleIds ?? null,
        dto.status ?? null,
      );
    }

    let roleIds: string[] | undefined;
    if (dto.roleIds !== undefined) {
      roleIds = await this.resolveRoleIds(
        dto.roleIds.length ? dto.roleIds : undefined,
      );
    }

    const data: {
      name?: string;
      status?: 'active' | 'inactive' | 'suspended';
      passwordHash?: string;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.user.update({ where: { id }, data });
      }
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: this.userInclude(),
      });
    });

    const events: string[] = [];
    if (dto.status && dto.status !== existing.status) {
      events.push('user.status_changed');
    }
    events.push('user.updated');

    for (const event of events) {
      await this.audit.writeAudit({
        event,
        success: true,
        userId: actor.id,
        companyId,
        ip: actor.ip,
        meta: {
          targetUserId: id,
          status: dto.status,
          rolesChanged: roleIds !== undefined,
        },
      });
    }
    await this.audit.writeActivity({
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      userId: actor.id,
      companyId,
      ip: actor.ip,
      meta: { status: user.status },
    });

    return this.serializeUser(user);
  }
}
