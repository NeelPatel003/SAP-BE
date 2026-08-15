import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async writeAudit(params: {
    event: string;
    success?: boolean;
    message?: string;
    userId?: string | null;
    companyId?: string | null;
    ip?: string | null;
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        event: params.event,
        success: params.success ?? true,
        message: params.message,
        userId: params.userId ?? null,
        companyId: params.companyId ?? null,
        ip: params.ip ?? null,
        meta: (params.meta as object) ?? undefined,
      },
    });
  }

  async writeActivity(params: {
    action: string;
    entityType?: string;
    entityId?: string;
    userId?: string | null;
    companyId?: string | null;
    ip?: string | null;
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.activityLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId ?? null,
        companyId: params.companyId ?? null,
        ip: params.ip ?? null,
        meta: (params.meta as object) ?? undefined,
      },
    });
  }

  async listActivity(params: {
    companyId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where: {
      companyId?: string;
      userId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.userId) where.userId = params.userId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          company: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async listAudit(params: {
    companyId?: string;
    userId?: string;
    event?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where: {
      companyId?: string;
      userId?: string;
      event?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.userId) where.userId = params.userId;
    if (params.event) where.event = params.event;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          company: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize };
  }
}
