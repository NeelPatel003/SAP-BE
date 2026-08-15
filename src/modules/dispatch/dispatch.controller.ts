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
import { DispatchService } from './dispatch.service';
import {
  CreateDispatchDto,
} from './dto/dispatch.dto';

@ApiTags('dispatch')
@ApiBearerAuth()
@UseGuards(ModuleEnabledGuard)
@RequireModule('dispatch')
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  @RequirePermissions('dispatch.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto & { status?: string },
  ) {
    return this.dispatch.list(requireCompanyId(user), q);
  }

  @Get(':id')
  @RequirePermissions('dispatch.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.get(requireCompanyId(user), id);
  }

  @Post()
  @RequirePermissions('dispatch.create')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateDispatchDto) {
    return this.dispatch.create(requireCompanyId(user), user.id, body);
  }

  @Post(':id/ship')
  @RequirePermissions('dispatch.ship')
  ship(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.ship(requireCompanyId(user), user.id, id);
  }
}
