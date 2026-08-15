import { Module } from '@nestjs/common';
import { KeepWarmService } from './keep-warm.service';

@Module({
  providers: [KeepWarmService],
})
export class KeepWarmModule {}
