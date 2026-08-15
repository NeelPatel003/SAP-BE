import { Module } from '@nestjs/common';
import { UsageMeterService } from './usage-meter.service';

@Module({
  providers: [UsageMeterService],
  exports: [UsageMeterService],
})
export class UsageModule {}
