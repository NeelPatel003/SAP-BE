import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      companiesTotal,
      usersTotal,
      companiesActive,
      failedLoginsToday,
      apiToday,
      api7d,
      api30d,
      recentCompanies,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.company.count({ where: { status: 'active' } }),
      this.prisma.auditLog.count({
        where: {
          event: 'login_failed',
          createdAt: { gte: startOfToday },
        },
      }),
      this.prisma.apiRequestLog.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.apiRequestLog.count({ where: { createdAt: { gte: d7 } } }),
      this.prisma.apiRequestLog.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.company.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      companiesTotal,
      companiesActive,
      usersTotal,
      failedLoginsToday,
      apiCalls: {
        today: apiToday,
        last7Days: api7d,
        last30Days: api30d,
      },
      recentCompanies,
    };
  }

  async apiUsage(params: {
    companyId?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where: {
      companyId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [items, total, byPath] = await Promise.all([
      this.prisma.apiRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          company: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.apiRequestLog.count({ where }),
      this.prisma.apiRequestLog.groupBy({
        by: ['path', 'method'],
        where,
        _count: { _all: true },
        orderBy: { _count: { path: 'desc' } },
        take: 20,
      }),
    ]);

    const since = params.from
      ? params.from
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dayWhere = {
      ...where,
      createdAt: {
        gte: since,
        ...(params.to ? { lte: params.to } : {}),
      },
    };
    const recentForDays = await this.prisma.apiRequestLog.findMany({
      where: dayWhere,
      select: { createdAt: true },
    });
    const dayMap = new Map<string, number>();
    for (const row of recentForDays) {
      const key = row.createdAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }
    const byDay = [...dayMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, count]) => ({ day, count }));

    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      byPath: byPath.map(
        (r: { path: string; method: string; _count: { _all: number } }) => ({
          path: r.path,
          method: r.method,
          count: r._count._all,
        }),
      ),
      byDay,
    };
  }

  async listModules() {
    return this.prisma.appModule.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, name: true, sortOrder: true },
    });
  }
}
