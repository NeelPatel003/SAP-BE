import { Module } from '@nestjs/common';
import { CompanyUsersController } from './company-users.controller';
import { CompanyUsersService } from './company-users.service';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuditModule, EmailModule],
  controllers: [CompanyUsersController],
  providers: [CompanyUsersService],
  exports: [CompanyUsersService],
})
export class CompanyUsersModule {}
