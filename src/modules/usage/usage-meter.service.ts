import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveBilling,
  CompanyBillingSettings,
} from '../../common/workflow/company-workflow';

export type UsageFeature = 'ai.chat' | 'report.pdf' | 'email.send' | string;

@Injectable()
export class UsageMeterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getBilling(companyId: string): Promise<CompanyBillingSettings> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });
    return resolveBilling(company?.settings);
  }

  private monthStart() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  private dayStartUtc() {
    const d = new Date();
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  dailyAiCallLimit() {
    const raw = this.config.get<string>('AI_DAILY_CALL_LIMIT');
    const n = raw ? parseInt(raw, 10) : 25;
    return Number.isFinite(n) && n > 0 ? n : 25;
  }

  async countAiCallsToday(companyId: string) {
    return this.prisma.featureUsageEvent.count({
      where: {
        companyId,
        feature: { startsWith: 'ai.' },
        createdAt: { gte: this.dayStartUtc() },
      },
    });
  }

  async remainingAiCallsToday(companyId: string) {
    const limit = this.dailyAiCallLimit();
    const used = await this.countAiCallsToday(companyId);
    return Math.max(0, limit - used);
  }

  async sumUnits(
    companyId: string,
    featurePrefix: string,
    field: 'inputUnits' | 'outputUnits' | 'total',
  ) {
    const since = this.monthStart();
    const rows = await this.prisma.featureUsageEvent.findMany({
      where: {
        companyId,
        feature: { startsWith: featurePrefix },
        createdAt: { gte: since },
      },
      select: { inputUnits: true, outputUnits: true },
    });
    if (field === 'total') {
      return rows.reduce((s, r) => s + r.inputUnits + r.outputUnits, 0);
    }
    return rows.reduce((s, r) => s + r[field], 0);
  }

  async assertWithinQuota(
    companyId: string,
    feature: UsageFeature,
    projectedUnits: number,
  ) {
    const billing = await this.getBilling(companyId);

    if (feature.startsWith('ai.')) {
      if (!billing.aiEnabled) {
        throw new ForbiddenException('AI is disabled for this company');
      }
      const dailyLimit = this.dailyAiCallLimit();
      const callsToday = await this.countAiCallsToday(companyId);
      if (callsToday >= dailyLimit) {
        throw new HttpException(
          `Daily AI call limit reached (${dailyLimit}/day). Try again tomorrow.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const used = await this.sumUnits(companyId, 'ai.', 'total');
      if (used + projectedUnits > billing.monthlyAiTokenCap) {
        throw new HttpException(
          'Monthly AI token quota exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (feature === 'email.send') {
      if (!billing.emailEnabled) {
        throw new ForbiddenException('Email is disabled for this company');
      }
      const used = await this.sumUnits(companyId, 'email.', 'total');
      if (used + projectedUnits > billing.monthlyEmailCap) {
        throw new HttpException(
          'Monthly email quota exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (feature === 'report.pdf') {
      if (!billing.reportsPdfEnabled) {
        throw new ForbiddenException('PDF reports disabled for this company');
      }
    }

    return billing;
  }

  async record(params: {
    companyId: string;
    userId?: string | null;
    feature: UsageFeature;
    provider?: string;
    model?: string;
    inputUnits?: number;
    outputUnits?: number;
    costMicros?: number;
    requestId?: string;
    meta?: object;
  }) {
    return this.prisma.featureUsageEvent.create({
      data: {
        companyId: params.companyId,
        userId: params.userId || null,
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        inputUnits: params.inputUnits || 0,
        outputUnits: params.outputUnits || 0,
        costMicros: params.costMicros || 0,
        requestId: params.requestId,
        meta: params.meta as object | undefined,
      },
    });
  }

  async companyUsage(
    companyId: string,
    params: { from?: Date; to?: Date; page?: number; pageSize?: number },
  ) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 200);
    const where: {
      companyId: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { companyId };
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [items, total, aggregated] = await Promise.all([
      this.prisma.featureUsageEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.featureUsageEvent.count({ where }),
      this.prisma.featureUsageEvent.groupBy({
        by: ['feature'],
        where,
        _sum: {
          inputUnits: true,
          outputUnits: true,
          costMicros: true,
        },
        _count: { _all: true },
      }),
    ]);

    const billing = await this.getBilling(companyId);
    const aiUsed = await this.sumUnits(companyId, 'ai.', 'total');
    const emailUsed = await this.sumUnits(companyId, 'email.', 'total');
    const aiCallsToday = await this.countAiCallsToday(companyId);
    const dailyLimit = this.dailyAiCallLimit();

    return {
      items,
      total,
      page,
      pageSize,
      byFeature: aggregated.map((r) => ({
        feature: r.feature,
        count: r._count._all,
        inputUnits: r._sum.inputUnits || 0,
        outputUnits: r._sum.outputUnits || 0,
        costMicros: r._sum.costMicros || 0,
      })),
      billing,
      monthToDate: {
        aiTokens: aiUsed,
        emails: emailUsed,
      },
      today: {
        aiCalls: aiCallsToday,
        aiCallLimit: dailyLimit,
        aiCallsRemaining: Math.max(0, dailyLimit - aiCallsToday),
      },
    };
  }
}
