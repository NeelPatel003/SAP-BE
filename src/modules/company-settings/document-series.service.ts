import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOC_TYPES,
  DOC_TYPE_SCAN,
  DOCUMENT_SERIES_CATALOG,
  DocType,
} from './document-series.catalog';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class DocumentSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  catalogDefaults() {
    return DOCUMENT_SERIES_CATALOG.map((c) => ({
      docType: c.docType,
      prefix: c.prefix,
      includeYear: c.includeYear,
      padLength: c.padLength,
      resetPolicy: c.resetPolicy,
      label: c.label,
    }));
  }

  async ensureDefaults(companyId: string, db?: Db) {
    const client = db || this.prisma;
    for (const c of DOCUMENT_SERIES_CATALOG) {
      await client.documentSeries.upsert({
        where: {
          companyId_docType: { companyId, docType: c.docType },
        },
        update: {},
        create: {
          companyId,
          docType: c.docType,
          prefix: c.prefix,
          includeYear: c.includeYear,
          padLength: c.padLength,
          resetPolicy: c.resetPolicy,
        },
      });
    }
  }

  buildNumberPrefix(
    series: { prefix: string; includeYear: boolean; resetPolicy: string },
    at = new Date(),
  ) {
    const base = (series.prefix || 'DOC').trim().toUpperCase().replace(/\s+/g, '');
    const year = at.getFullYear();
    if (series.includeYear || series.resetPolicy === 'yearly') {
      return `${base}-${year}-`;
    }
    return `${base}-`;
  }

  previewNext(
    series: {
      prefix: string;
      includeYear: boolean;
      padLength: number;
      resetPolicy: string;
    },
    nextSeq = 1,
  ) {
    const p = this.buildNumberPrefix(series);
    const pad = Math.min(10, Math.max(1, series.padLength || 5));
    return `${p}${String(nextSeq).padStart(pad, '0')}`;
  }

  async next(companyId: string, docType: DocType, db?: Db): Promise<string> {
    if (!DOC_TYPES.includes(docType)) {
      throw new Error(`Unknown doc type: ${docType}`);
    }
    const client = db || this.prisma;
    await this.ensureDefaults(companyId, client);

    let series = await client.documentSeries.findUnique({
      where: { companyId_docType: { companyId, docType } },
    });
    if (!series) {
      const def = DOCUMENT_SERIES_CATALOG.find((c) => c.docType === docType)!;
      series = await client.documentSeries.create({
        data: {
          companyId,
          docType,
          prefix: def.prefix,
          includeYear: def.includeYear,
          padLength: def.padLength,
          resetPolicy: def.resetPolicy,
        },
      });
    }

    const numberPrefix = this.buildNumberPrefix(series);
    const scan = DOC_TYPE_SCAN[docType];
    const pad = Math.min(10, Math.max(1, series.padLength || 5));

    const maxSeq = await this.maxSeq(
      client,
      companyId,
      scan.model,
      scan.field,
      numberPrefix,
    );

    return `${numberPrefix}${String(maxSeq + 1).padStart(pad, '0')}`;
  }

  private async maxSeq(
    client: Db,
    companyId: string,
    model: (typeof DOC_TYPE_SCAN)[DocType]['model'],
    field: 'number' | 'batchNumber',
    numberPrefix: string,
  ): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (client as any)[model] as {
      findMany: (args: unknown) => Promise<Record<string, string>[]>;
    };

    const rows = await delegate.findMany({
      where: {
        companyId,
        [field]: { startsWith: numberPrefix },
      },
      select: { [field]: true },
      take: 5000,
    });

    let seq = 0;
    for (const r of rows) {
      const raw = r[field] || '';
      const n = parseInt(raw.slice(numberPrefix.length), 10);
      if (!Number.isNaN(n) && n > seq) seq = n;
    }
    return seq;
  }
}
