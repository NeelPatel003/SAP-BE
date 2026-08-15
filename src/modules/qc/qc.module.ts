import { Module, forwardRef } from '@nestjs/common';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';
import { StoreModule } from '../store/store.module';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => StoreModule), AuditModule],
  controllers: [QcController],
  providers: [QcService, ModuleEnabledGuard],
})
export class QcModule {}
