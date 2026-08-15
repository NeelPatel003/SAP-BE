import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
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
import { PurchaseService } from './purchase.service';
import {
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase.dto';

@ApiTags('purchase')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('purchase')
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchase: PurchaseService) {}

  @Get('suppliers')
  @RequirePermissions('purchase.suppliers.read')
  listSuppliers(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.purchase.listSuppliers(requireCompanyId(user), q);
  }

  @Post('suppliers')
  @RequirePermissions('purchase.suppliers.write')
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSupplierDto,
  ) {
    return this.purchase.createSupplier(requireCompanyId(user), body);
  }

  @Get('orders')
  @RequirePermissions('purchase.orders.read')
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { status?: string },
  ) {
    return this.purchase.listOrders(requireCompanyId(user), q);
  }

  @Get('orders/:id')
  @RequirePermissions('purchase.orders.read')
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchase.getOrder(requireCompanyId(user), id);
  }

  @Post('orders')
  @RequirePermissions('purchase.orders.write')
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePurchaseOrderDto,
  ) {
    return this.purchase.createOrder(requireCompanyId(user), body);
  }

  @Patch('orders/:id')
  @RequirePermissions('purchase.orders.write')
  updateOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdatePurchaseOrderDto,
  ) {
    return this.purchase.updateOrder(requireCompanyId(user), id, body);
  }
}
