import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { BomService } from './bom.service';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [CompanySettingsModule, StoreModule],
  controllers: [ProductionController],
  providers: [ProductionService, BomService, ModuleEnabledGuard],
  exports: [ProductionService, BomService],
})
export class ProductionModule {}
