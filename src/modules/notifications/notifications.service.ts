import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
    meta?: object;
  }) {
    return this.prisma.notification.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link,
        meta: params.meta as object | undefined,
      },
    });
  }

  async notifyCompanyUsersWithPermission(
    companyId: string,
    permissionCode: string,
    payload: {
      type: string;
      title: string;
      body?: string;
      link?: string;
      meta?: object;
    },
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'active',
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: { permission: { code: permissionCode } },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    // also company admins (have broad perms)
    const admins = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'active',
        userRoles: { some: { role: { code: 'COMPANY_ADMIN' } } },
      },
      select: { id: true },
    });

    const ids = new Set([...users, ...admins].map((u) => u.id));
    const created = [];
    for (const userId of ids) {
      created.push(
        await this.create({
          companyId,
          userId,
          ...payload,
        }),
      );
    }
    return created;
  }

  async list(
    companyId: string,
    userId: string,
    q: { unreadOnly?: boolean; page?: number; pageSize?: number },
  ) {
    const page = q.page || 1;
    const pageSize = Math.min(q.pageSize || 30, 100);
    const where = {
      companyId,
      userId,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { companyId, userId, readAt: null },
      }),
    ]);
    return { items, total, page, pageSize, unreadCount };
  }

  async markRead(companyId: string, userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, companyId, userId },
    });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(companyId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
