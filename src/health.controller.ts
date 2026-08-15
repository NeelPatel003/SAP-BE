import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './modules/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        service: 'teamora-api',
        db: 'up',
        ts: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'teamora-api',
        db: 'down',
        ts: new Date().toISOString(),
      });
    }
  }
}
