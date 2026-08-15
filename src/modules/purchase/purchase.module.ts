import { Module } from '@nestjs/common';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [CompanySettingsModule],
  controllers: [PurchaseController],
  providers: [PurchaseService, ModuleEnabledGuard],
  exports: [PurchaseService],
})
export class PurchaseModule {}
