import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { AdminModule } from './modules/admin/admin.module';
import { StoreModule } from './modules/store/store.module';
import { CompanyUsersModule } from './modules/company-users/company-users.module';
import { CompanySettingsModule } from './modules/company-settings/company-settings.module';
import { PurchaseModule } from './modules/purchase/purchase.module';
import { QcModule } from './modules/qc/qc.module';
import { ProductionModule } from './modules/production/production.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { UsageModule } from './modules/usage/usage.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EmailModule } from './modules/email/email.module';
import { AiModule } from './modules/ai/ai.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { KeepWarmModule } from './modules/keep-warm/keep-warm.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ApiUsageInterceptor } from './common/interceptors/api-usage.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    AdminModule,
    CompanyUsersModule,
    CompanySettingsModule,
    StoreModule,
    PurchaseModule,
    QcModule,
    ProductionModule,
    AccountsModule,
    DispatchModule,
    UsageModule,
    NotificationsModule,
    EmailModule,
    AiModule,
    KeepWarmModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiUsageInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
