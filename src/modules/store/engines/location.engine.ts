import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationEngine {
  constructor(private readonly prisma: PrismaService) {}

  async assertWarehouse(companyId: string, warehouseId: string) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId, isActive: true },
    });
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }

  async assertLocation(
    companyId: string,
    warehouseId: string,
    locationId?: string | null,
  ) {
    if (!locationId) return null;
    const loc = await this.prisma.location.findFirst({
      where: { id: locationId, companyId, warehouseId, isActive: true },
    });
    if (!loc) throw new BadRequestException('Invalid location for warehouse');
    return loc;
  }
}
