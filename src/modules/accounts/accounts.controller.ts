import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  @Get('invoices')
  @RequirePermissions('accounts.grn.read')
  invoices(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.accounts.listInvoices(requireCompanyId(user), q);
  }

  @Post('invoices')
  @RequirePermissions('accounts.grn.book')
  attachInvoice(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      invoiceNumber: string;
      amount: number;
      taxAmount?: number;
      goodsReceiptIds: string[];
      attachmentUrl?: string;
    },
  ) {
    return this.accounts.attachInvoice(
      requireCompanyId(user),
      user.id,
      body,
    );
  }

  @Post('invoices/:id/verify')
  @RequirePermissions('accounts.grn.book')
  verifyInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.verifyInvoice(requireCompanyId(user), user.id, id);
  }

  @Post('bookings')
  @RequirePermissions('accounts.grn.book')
  bookPurchase(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      supplierInvoiceId: string;
      debitLines?: { account: string; amount: number }[];
      creditLines?: { account: string; amount: number }[];
    },
  ) {
    return this.accounts.bookPurchase(requireCompanyId(user), user.id, body);
  }

  @Post('grn/:id/mark-booked')
  @RequirePermissions('accounts.grn.book')
  markBooked(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.markBooked(requireCompanyId(user), user.id, id);
  }
}
