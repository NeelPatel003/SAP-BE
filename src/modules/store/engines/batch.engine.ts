import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentSeriesService } from '../../company-settings/document-series.service';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class BatchEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly series: DocumentSeriesService,
  ) {}

  async nextBatchNumber(
    companyId: string,
    _year = new Date().getFullYear(),
    db?: Db,
  ) {
    return this.series.next(companyId, 'batch', db);
  }

  barcodePayload(batchNumber: string, materialCode: string) {
    return `BN:${batchNumber}|MAT:${materialCode}`;
  }
}
