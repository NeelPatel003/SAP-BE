import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  paginateParams,
  paginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';

@Injectable()
export class SerialService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    companyId: string,
    q: PaginationQueryDto & {
      materialId?: string;
      batchId?: string;
      status?: string;
    },
  ) {
    const p = paginateParams(q);
    const where = {
      companyId,
      ...(q.materialId ? { materialId: q.materialId } : {}),
      ...(q.batchId ? { batchId: q.batchId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(p.search
        ? {
            serialNumber: {
              contains: p.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventorySerial.findMany({
        where,
        include: { material: true, batch: true },
        orderBy: { createdAt: 'desc' },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.inventorySerial.count({ where }),
    ]);
    return paginatedResult(items, total, p.page, p.pageSize);
  }

  async createMany(
    companyId: string,
    body: {
      materialId: string;
      batchId?: string;
      serials: string[];
    },
  ) {
    const material = await this.prisma.material.findFirst({
      where: { id: body.materialId, companyId },
    });
    if (!material) throw new NotFoundException('Material not found');
    if (!material.serialTracked) {
      throw new BadRequestException('Material is not serial-tracked');
    }
    if (!body.serials?.length) {
      throw new BadRequestException('At least one serial required');
    }
    if (body.batchId) {
      const batch = await this.prisma.inventoryBatch.findFirst({
        where: { id: body.batchId, companyId, materialId: body.materialId },
      });
      if (!batch) throw new NotFoundException('Batch not found for material');
    }

    const cleaned = [
      ...new Set(
        body.serials.map((s) => String(s || '').trim()).filter(Boolean),
      ),
    ];
    if (!cleaned.length) {
      throw new BadRequestException('No valid serial numbers');
    }

    const created = [];
    for (const serialNumber of cleaned) {
      try {
        const row = await this.prisma.inventorySerial.create({
          data: {
            companyId,
            materialId: body.materialId,
            batchId: body.batchId || null,
            serialNumber,
            status: 'available',
          },
        });
        created.push(row);
      } catch {
        throw new BadRequestException(
          `Serial already exists: ${serialNumber}`,
        );
      }
    }
    return { created: created.length, items: created };
  }
}
