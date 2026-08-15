import { Module, forwardRef } from '@nestjs/common';
import { StoreController } from './store.controller';
import { StoreMastersService } from './store-masters.service';
import { GrnService } from './grn.service';
import { IssueService } from './issue.service';
import { StoreQueryService } from './store-query.service';
import { BatchEngine } from './engines/batch.engine';
import { StockEngine } from './engines/stock.engine';
import { FifoEngine } from './engines/fifo.engine';
import { LocationEngine } from './engines/location.engine';
import { ReservationEngine } from './engines/reservation.engine';
import { AgingEngine } from './engines/aging.engine';
import { TraceabilityEngine } from './engines/traceability.engine';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { UsageModule } from '../usage/usage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { SerialService } from './serial.service';

@Module({
  imports: [
    CompanySettingsModule,
    UsageModule,
    NotificationsModule,
    EmailModule,
    AuditModule,
  ],
  controllers: [StoreController],
  providers: [
    ModuleEnabledGuard,
    StoreMastersService,
    GrnService,
    IssueService,
    SerialService,
    StoreQueryService,
    BatchEngine,
    StockEngine,
    FifoEngine,
    LocationEngine,
    ReservationEngine,
    AgingEngine,
    TraceabilityEngine,
  ],
  exports: [
    StockEngine,
    FifoEngine,
    BatchEngine,
    GrnService,
    IssueService,
    AgingEngine,
    StoreQueryService,
    LocationEngine,
    ReservationEngine,
  ],
})
export class StoreModule {}
