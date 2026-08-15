import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  ModuleEnabledGuard,
  RequireModule,
} from '../../common/guards/module-enabled.guard';
import { requireCompanyId } from '../../common/utils/tenant';
import { ApplyQcDto } from '../store/dto/store.dto';
import { QcService } from './qc.service';

@ApiTags('qc')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('qc')
@Controller('qc')
export class QcController {
  constructor(private readonly qc: QcService) {}

  @Get('queue')
  @RequirePermissions('qc.queue.read')
  queue(@CurrentUser() user: AuthUser) {
    return this.qc.queue(requireCompanyId(user));
  }

  @Post('inspections')
  @RequirePermissions('qc.inspect')
  inspect(@CurrentUser() user: AuthUser, @Body() body: ApplyQcDto) {
    return this.qc.inspect(requireCompanyId(user), user.id, body);
  }
}
