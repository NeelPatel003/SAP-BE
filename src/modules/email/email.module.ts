import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [UsageModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
