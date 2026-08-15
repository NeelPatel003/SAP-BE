import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UsageModule } from '../usage/usage.module';
import { StoreModule } from '../store/store.module';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';

@Module({
  imports: [UsageModule, StoreModule],
  controllers: [AiController],
  providers: [AiService, ModuleEnabledGuard],
})
export class AiModule {}
