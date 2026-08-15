import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [CompanySettingsModule, StoreModule],
  controllers: [DispatchController],
  providers: [DispatchService, ModuleEnabledGuard],
  exports: [DispatchService],
})
export class DispatchModule {}
