import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CreateBomDto,
  CreateMaterialRequestDto,
  CreateProductionOrderDto,
  ExplodeBomDto,
  UpdateBomDto,
  UpdateProductionOrderDto,
} from './dto/production.dto';
import { ProductionService } from './production.service';
import { BomService } from './bom.service';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('production')
@Controller('production')
export class ProductionController {
  constructor(
    private readonly production: ProductionService,
    private readonly boms: BomService,
  ) {}

  @Get('orders')
  @RequirePermissions('production.orders.read')
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { status?: string },
  ) {
    return this.production.listOrders(requireCompanyId(user), q);
  }

  @Get('orders/:id')
  @RequirePermissions('production.orders.read')
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.production.getOrder(requireCompanyId(user), id);
  }

  @Post('orders')
  @RequirePermissions('production.orders.write')
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateProductionOrderDto,
  ) {
    return this.production.createOrder(requireCompanyId(user), body);
  }

  @Patch('orders/:id')
  @RequirePermissions('production.orders.write')
  updateOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateProductionOrderDto,
  ) {
    return this.production.updateOrder(requireCompanyId(user), id, body);
  }

  @Get('requests')
  @RequirePermissions('production.requests.read')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.production.listRequests(requireCompanyId(user), q);
  }

  @Post('requests')
  @RequirePermissions('production.requests.write')
  createRequest(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMaterialRequestDto,
  ) {
    return this.production.createRequest(
      requireCompanyId(user),
      user.id,
      body,
    );
  }

  @Get('boms')
  @RequirePermissions('production.bom.read')
  listBoms(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { status?: string },
  ) {
    return this.boms.list(requireCompanyId(user), q);
  }

  @Get('boms/:id')
  @RequirePermissions('production.bom.read')
  getBom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.boms.get(requireCompanyId(user), id);
  }

  @Post('boms')
  @RequirePermissions('production.bom.write')
  createBom(@CurrentUser() user: AuthUser, @Body() body: CreateBomDto) {
    return this.boms.create(requireCompanyId(user), body);
  }

  @Patch('boms/:id')
  @RequirePermissions('production.bom.write')
  updateBom(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateBomDto,
  ) {
    return this.boms.update(requireCompanyId(user), id, body);
  }

  @Post('boms/:id/explode')
  @RequirePermissions('production.bom.write')
  explodeBom(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ExplodeBomDto,
  ) {
    return this.boms.explode(requireCompanyId(user), id, user.id, body);
  }
}
