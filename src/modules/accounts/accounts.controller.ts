import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AccountsService } from './accounts.service';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('grn-pending')
  @RequirePermissions('accounts.grn.read')
  pending(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.accounts.listPendingGrn(requireCompanyId(user), q);
  }

  @Post('grn/:id/mark-booked')
  @RequirePermissions('accounts.grn.book')
  markBooked(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.markBooked(requireCompanyId(user), user.id, id);
  }
}
