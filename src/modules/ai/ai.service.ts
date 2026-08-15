import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsageMeterService } from '../usage/usage-meter.service';
import { AgingEngine } from '../store/engines/aging.engine';
import { resolveBilling } from '../../common/workflow/company-workflow';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meter: UsageMeterService,
    private readonly aging: AgingEngine,
  ) {}

  async summarizeInventory(companyId: string, userId: string, prompt?: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true, enabledModules: true, name: true },
    });
    const modules = Array.isArray(company?.enabledModules)
      ? (company!.enabledModules as string[])
      : [];
    if (!modules.includes('ai')) {
      throw new ForbiddenException('AI module is not enabled for this company');
    }
    const billing = resolveBilling(company?.settings);
    if (!billing.aiEnabled) {
      throw new ForbiddenException('AI is disabled for this company');
    }

    // Pre-flight with modest projected units
    await this.meter.assertWithinQuota(companyId, 'ai.chat', 1500);

    const [stockAgg, agingBuckets, lowStock] = await Promise.all([
      this.prisma.inventoryStock.groupBy({
        by: ['status'],
        where: { companyId, quantity: { gt: 0 } },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.aging.analyze(companyId).catch(() => []),
      this.prisma.material.findMany({
        where: { companyId, status: 'active', minStock: { gt: 0 } },
        take: 50,
        select: {
          id: true,
          code: true,
          name: true,
          minStock: true,
        },
      }),
    ]);

    // Low stock approximation
    const low: { code: string; name: string; minStock: number; onHand: number }[] =
      [];
    for (const m of lowStock) {
      const sum = await this.prisma.inventoryStock.aggregate({
        where: {
          companyId,
          materialId: m.id,
          status: 'available',
        },
        _sum: { quantity: true },
      });
      const onHand = sum._sum.quantity || 0;
      if (onHand < (m.minStock || 0)) {
        low.push({
          code: m.code,
          name: m.name,
          minStock: m.minStock || 0,
          onHand,
        });
      }
    }

    const facts = {
      company: company?.name,
      byStatus: stockAgg.map((s) => ({
        status: s.status,
        qty: s._sum.quantity || 0,
        lines: s._count._all,
      })),
      aging: agingBuckets,
      lowStock: low.slice(0, 15),
      userPrompt: (prompt || 'Summarize inventory risk for this week').slice(
        0,
        500,
      ),
    };

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    let summary: string;
    let provider = 'local';
    let model = 'rules';
    let inputUnits = 400;
    let outputUnits = 200;
    let costMicros = 0;

    if (apiKey) {
      try {
        const result = await this.callOpenAi(apiKey, facts);
        summary = result.text;
        provider = 'openai';
        model = result.model;
        inputUnits = result.inputTokens;
        outputUnits = result.outputTokens;
        costMicros = result.costMicros;
      } catch (e) {
        summary = this.localSummarize(facts);
        provider = 'local-fallback';
      }
    } else {
      summary = this.localSummarize(facts);
    }

    await this.meter.assertWithinQuota(
      companyId,
      'ai.chat',
      inputUnits + outputUnits,
    );
    await this.meter.record({
      companyId,
      userId,
      feature: 'ai.chat',
      provider,
      model,
      inputUnits,
      outputUnits,
      costMicros,
      meta: { kind: 'inventory_summary' },
    });

    return {
      summary,
      facts: {
        byStatus: facts.byStatus,
        lowStockCount: low.length,
        aging: facts.aging,
      },
      provider,
      model,
      usage: { inputUnits, outputUnits, costMicros },
    };
  }

  private localSummarize(facts: {
    company?: string;
    byStatus: { status: string; qty: number; lines: number }[];
    aging: unknown;
    lowStock: { code: string; name: string; minStock: number; onHand: number }[];
    userPrompt: string;
  }) {
    const avail = facts.byStatus.find((s) => s.status === 'available');
    const hold = facts.byStatus.find((s) => s.status === 'quality_hold');
    const lines = [
      `Inventory summary for ${facts.company || 'company'}:`,
      `- Available stock lines: ${avail?.lines ?? 0} (qty ${avail?.qty ?? 0}).`,
      `- Quality hold lines: ${hold?.lines ?? 0} (qty ${hold?.qty ?? 0}).`,
      `- Materials under min stock: ${facts.lowStock.length}.`,
    ];
    if (facts.lowStock.length) {
      lines.push(
        `- Examples: ${facts.lowStock
          .slice(0, 5)
          .map((m) => `${m.code} (${m.onHand}/${m.minStock})`)
          .join(', ')}.`,
      );
    }
    lines.push(`Focus: ${facts.userPrompt}`);
    return lines.join('\n');
  }

  private async callOpenAi(
    apiKey: string,
    facts: object,
  ): Promise<{
    text: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
  }> {
    const model =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are an inventory analyst for manufacturing ERP. Use only the JSON facts provided. Do not invent SKUs. Be concise.',
          },
          {
            role: 'user',
            content: JSON.stringify(facts),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException('AI provider error');
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text =
      data.choices?.[0]?.message?.content?.trim() ||
      'No summary generated.';
    const inputTokens = data.usage?.prompt_tokens || 500;
    const outputTokens = data.usage?.completion_tokens || 150;
    // Rough gpt-4o-mini pricing placeholder in micro-USD
    const costMicros = Math.round(
      inputTokens * 0.15 + outputTokens * 0.6,
    );
    return { text, model, inputTokens, outputTokens, costMicros };
  }
}
