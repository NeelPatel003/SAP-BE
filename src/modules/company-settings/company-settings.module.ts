import { Module } from '@nestjs/common';
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsService } from './company-settings.service';
import { DocumentSeriesService } from './document-series.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CompanySettingsController],
  providers: [CompanySettingsService, DocumentSeriesService],
  exports: [DocumentSeriesService, CompanySettingsService],
})
export class CompanySettingsModule {}
