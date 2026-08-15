import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { IndustryTemplateService } from './industry-templates';
import { AuditModule } from '../audit/audit.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [AuditModule, CompanySettingsModule],
  providers: [CompaniesService, IndustryTemplateService],
  exports: [CompaniesService, IndustryTemplateService],
})
export class CompaniesModule {}
