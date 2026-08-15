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

type AiKind =
  | 'inventory_summary'
  | 'aging_brief'
  | 'grn_qc_brief'
  | 'reorder_suggestions'
  | 'accounts_check';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meter: UsageMeterService,
    private readonly aging: AgingEngine,
  ) {}

  private async assertAiAllowed(companyId: string) {
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
    await this.meter.assertWithinQuota(companyId, 'ai.chat', 1500);
    return company;
  }

  private async complete(
    companyId: string,
    userId: string,
    kind: AiKind,
    system: string,
    facts: object,
    localText: string,
    visuals?: {
      charts?: { type: 'bar' | 'pie'; title: string; data: { name: string; value: number }[] }[];
      tables?: { title: string; columns: string[]; rows: (string | number)[][] }[];
    },
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    let summary = localText;
    let provider = 'local';
    let model = 'rules';
    let inputUnits = 400;
    let outputUnits = 200;
    let costMicros = 0;

    if (apiKey) {
      try {
        const result = await this.callOpenAi(apiKey, system, facts);
        summary = result.text;
        provider = 'openai';
        model = result.model;
        inputUnits = result.inputTokens;
        outputUnits = result.outputTokens;
        costMicros = result.costMicros;
      } catch {
        provider = 'local-fallback';
      }
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
      meta: { kind },
    });

    const remaining = await this.meter.remainingAiCallsToday(companyId);
    return {
      summary,
      kind,
      facts,
      visuals: visuals || { charts: [], tables: [] },
      provider,
      model,
      usage: { inputUnits, outputUnits, costMicros },
      freeTier: {
        dailyLimit: this.meter.dailyAiCallLimit(),
        remainingToday: remaining,
      },
    };
  }

  async summarizeInventory(companyId: string, userId: string, prompt?: string) {
    const company = await this.assertAiAllowed(companyId);
    const [stockAgg, agingBuckets, low] = await Promise.all([
      this.prisma.inventoryStock.groupBy({
        by: ['status'],
        where: { companyId, quantity: { gt: 0 } },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.aging.analyze(companyId).catch(() => null),
      this.collectLowStock(companyId, 15),
    ]);

    const facts = {
      company: company?.name,
      byStatus: stockAgg.map((s) => ({
        status: s.status,
        qty: s._sum.quantity || 0,
        lines: s._count._all,
      })),
      aging: agingBuckets
        ? {
            nearExpiry: agingBuckets.nearExpiry?.length ?? 0,
            expired: agingBuckets.expired?.length ?? 0,
            slowMoving: agingBuckets.slowMoving?.length ?? 0,
            deadStock: agingBuckets.deadStock?.length ?? 0,
          }
        : null,
      lowStock: low,
      userPrompt: (prompt || 'Summarize inventory risk for this week').slice(
        0,
        500,
      ),
    };

    const local = [
      `Inventory summary for ${facts.company || 'company'}:`,
      `- Status lines: ${facts.byStatus.map((s) => `${s.status}=${s.lines}`).join(', ') || 'none'}.`,
      `- Under min stock: ${low.length}.`,
      facts.aging
        ? `- Near expiry ${facts.aging.nearExpiry}, expired ${facts.aging.expired}, slow ${facts.aging.slowMoving}, dead ${facts.aging.deadStock}.`
        : '',
      `Focus: ${facts.userPrompt}`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.complete(
      companyId,
      userId,
      'inventory_summary',
      'You are an inventory analyst for manufacturing ERP. Use only the JSON facts. Do not invent SKUs. Be concise (max 8 bullets).',
      facts,
      local,
      {
        charts: [
          {
            type: 'pie',
            title: 'Stock by status',
            data: facts.byStatus.map((s) => ({
              name: s.status,
              value: s.qty,
            })),
          },
          {
            type: 'bar',
            title: 'Aging alerts (count)',
            data: [
              { name: 'Near expiry', value: facts.aging?.nearExpiry ?? 0 },
              { name: 'Expired', value: facts.aging?.expired ?? 0 },
              { name: 'Slow', value: facts.aging?.slowMoving ?? 0 },
              { name: 'Dead', value: facts.aging?.deadStock ?? 0 },
            ],
          },
        ],
        tables: [
          {
            title: 'Below minimum',
            columns: ['Code', 'Name', 'On hand', 'Min'],
            rows: low.map((m) => [m.code, m.name, m.onHand, m.minStock]),
          },
        ],
      },
    );
    return result;
  }

  async agingBrief(companyId: string, userId: string, prompt?: string) {
    await this.assertAiAllowed(companyId);
    const aging = await this.aging.analyze(companyId);
    const facts = {
      nearExpiry: (aging.nearExpiry || []).slice(0, 10),
      expired: (aging.expired || []).slice(0, 10),
      slowMoving: (aging.slowMoving || []).slice(0, 10),
      deadStock: (aging.deadStock || []).slice(0, 10),
      policy: aging.policy,
      userPrompt: (prompt || 'Brief aging and FEFO risks').slice(0, 500),
    };
    const local = [
      'Aging brief:',
      `- Near expiry: ${facts.nearExpiry.length}`,
      `- Expired: ${facts.expired.length}`,
      `- Slow moving: ${facts.slowMoving.length}`,
      `- Dead stock: ${facts.deadStock.length}`,
      `Policy: near ${facts.policy?.nearExpiryDays}d / slow ${facts.policy?.slowStockDays}d / dead ${facts.policy?.deadStockDays}d`,
    ].join('\n');
    return this.complete(
      companyId,
      userId,
      'aging_brief',
      'You analyze stock aging for a factory store. Use only JSON facts. Separate slow vs dead. Max 8 bullets.',
      facts,
      local,
      {
        charts: [
          {
            type: 'bar',
            title: 'Aging buckets (lines)',
            data: [
              { name: 'Near expiry', value: facts.nearExpiry.length },
              { name: 'Expired', value: facts.expired.length },
              { name: 'Slow', value: facts.slowMoving.length },
              { name: 'Dead', value: facts.deadStock.length },
            ],
          },
        ],
        tables: [
          {
            title: 'Near expiry sample',
            columns: ['Material', 'Batch', 'Qty'],
            rows: facts.nearExpiry
              .slice(0, 8)
              .map((r: { material?: { code?: string }; batchNumber?: string; quantity?: number }) => [
                r.material?.code || '—',
                r.batchNumber || '—',
                r.quantity ?? 0,
              ]),
          },
        ],
      },
    );
  }

  async grnQcBrief(companyId: string, userId: string, prompt?: string) {
    await this.assertAiAllowed(companyId);
    const [drafts, pendingQc, recent] = await Promise.all([
      this.prisma.goodsReceipt.count({
        where: { companyId, status: 'draft' },
      }),
      this.prisma.goodsReceipt.count({
        where: { companyId, status: 'pending_qc' },
      }),
      this.prisma.goodsReceipt.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          number: true,
          status: true,
          createdAt: true,
          supplier: { select: { name: true } },
        },
      }),
    ]);
    const facts = {
      drafts,
      pendingQc,
      recent: recent.map((g) => ({
        number: g.number,
        status: g.status,
        supplier: g.supplier?.name,
        createdAt: g.createdAt,
      })),
      userPrompt: (prompt || 'Summarize GRN and QC backlog').slice(0, 500),
    };
    const local = [
      'GRN / QC brief:',
      `- Draft GRNs: ${drafts}`,
      `- Pending QC: ${pendingQc}`,
      `- Recent: ${facts.recent.map((g) => `${g.number}(${g.status})`).join(', ') || 'none'}`,
    ].join('\n');
    return this.complete(
      companyId,
      userId,
      'grn_qc_brief',
      'You summarize goods receipt and QC backlog for store managers. Use only JSON. Max 8 bullets.',
      facts,
      local,
      {
        charts: [
          {
            type: 'pie',
            title: 'GRN backlog',
            data: [
              { name: 'Draft', value: drafts },
              { name: 'Pending QC', value: pendingQc },
            ],
          },
        ],
        tables: [
          {
            title: 'Recent GRNs',
            columns: ['Number', 'Status', 'Supplier'],
            rows: facts.recent.map((g) => [
              g.number,
              g.status,
              g.supplier || '—',
            ]),
          },
        ],
      },
    );
  }

  async reorderSuggestions(companyId: string, userId: string, prompt?: string) {
    await this.assertAiAllowed(companyId);
    const low = await this.collectLowStock(companyId, 20);
    const facts = {
      lowStock: low,
      userPrompt: (prompt || 'Suggest reorder priorities').slice(0, 500),
    };
    const local = [
      'Reorder suggestions:',
      ...low
        .slice(0, 10)
        .map(
          (m) =>
            `- ${m.code}: on hand ${m.onHand} / min ${m.minStock}${
              m.reorderQty ? ` · reorder qty ${m.reorderQty}` : ''
            }`,
        ),
      low.length ? '' : '- No materials under minimum.',
    ]
      .filter((l) => l !== undefined)
      .join('\n');
    return this.complete(
      companyId,
      userId,
      'reorder_suggestions',
      'You suggest reorder priorities from low-stock facts only. Do not invent suppliers. Max 8 bullets.',
      facts,
      local,
      {
        charts: [
          {
            type: 'bar',
            title: 'On hand vs min',
            data: low.slice(0, 8).map((m) => ({
              name: m.code,
              value: m.onHand,
            })),
          },
        ],
        tables: [
          {
            title: 'Reorder candidates',
            columns: ['Code', 'Name', 'On hand', 'Min', 'Reorder qty'],
            rows: low.map((m) => [
              m.code,
              m.name,
              m.onHand,
              m.minStock,
              m.reorderQty ?? 0,
            ]),
          },
        ],
      },
    );
  }

  async accountsCheck(companyId: string, userId: string, prompt?: string) {
    await this.assertAiAllowed(companyId);
    const [invoices, pendingGrn] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          invoiceNumber: true,
          amount: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.goodsReceipt.count({
        where: {
          companyId,
          status: { in: ['approved', 'completed', 'partial'] },
        },
      }),
    ]);
    const facts = {
      invoices: invoices.map((i) => ({
        number: i.invoiceNumber,
        amount: i.amount,
        status: i.verificationStatus,
      })),
      postedGrnCount: pendingGrn,
      userPrompt: (prompt || 'Check invoice vs GRN booking status').slice(
        0,
        500,
      ),
    };
    const local = [
      'Accounts check:',
      `- Recent invoices: ${facts.invoices.length}`,
      ...facts.invoices
        .slice(0, 5)
        .map((i) => `- ${i.number}: ${i.amount} (${i.status})`),
      `- Posted/approved GRN count (sample filter): ${pendingGrn}`,
    ].join('\n');
    return this.complete(
      companyId,
      userId,
      'accounts_check',
      'You review supplier invoices vs GRN booking for AP. Use only JSON. Flag unverified or unbooked. Max 8 bullets.',
      facts,
      local,
      {
        charts: [
          {
            type: 'pie',
            title: 'Invoice verification',
            data: Object.entries(
              facts.invoices.reduce(
                (acc: Record<string, number>, i: { status: string }) => {
                  acc[i.status] = (acc[i.status] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            ).map(([name, value]) => ({ name, value: value as number })),
          },
        ],
        tables: [
          {
            title: 'Recent invoices',
            columns: ['Invoice', 'Amount', 'Status'],
            rows: facts.invoices.map((i) => [i.number, i.amount, i.status]),
          },
        ],
      },
    );
  }

  private async collectLowStock(companyId: string, take: number) {
    const materials = await this.prisma.material.findMany({
      where: { companyId, status: 'active', minStock: { gt: 0 } },
      take: 50,
      select: {
        id: true,
        code: true,
        name: true,
        minStock: true,
        reorderQty: true,
      },
    });
    const low: {
      code: string;
      name: string;
      minStock: number;
      onHand: number;
      reorderQty?: number | null;
    }[] = [];
    for (const m of materials) {
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
          reorderQty: m.reorderQty,
        });
      }
      if (low.length >= take) break;
    }
    return low;
  }

  private async callOpenAi(
    apiKey: string,
    system: string,
    facts: object,
  ): Promise<{
    text: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
  }> {
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(facts) },
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
      data.choices?.[0]?.message?.content?.trim() || 'No summary generated.';
    const inputTokens = data.usage?.prompt_tokens || 500;
    const outputTokens = data.usage?.completion_tokens || 150;
    const costMicros = Math.round(inputTokens * 0.15 + outputTokens * 0.6);
    return { text, model, inputTokens, outputTokens, costMicros };
  }
}
