import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CompaniesModule } from '../companies/companies.module';
import { AuditModule } from '../audit/audit.module';
import { UsageModule } from '../usage/usage.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [CompaniesModule, AuditModule, UsageModule, CompanySettingsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
