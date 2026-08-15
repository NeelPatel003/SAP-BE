import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { RazorpayWebhookStubController } from './razorpay-webhook.stub.controller';
import { AccountsService } from './accounts.service';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AccountsController, RazorpayWebhookStubController],
  providers: [AccountsService, ModuleEnabledGuard],
})
export class AccountsModule {}
