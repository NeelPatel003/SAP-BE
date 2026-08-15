import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { requireCompanyId } from '../../common/utils/tenant';
import { CompanyUsersService } from './company-users.service';
import {
  CreateCompanyUserDto,
  ListCompanyUsersQueryDto,
  UpdateCompanyUserDto,
} from './dto/company-users.dto';

@ApiTags('company-users')
@ApiBearerAuth()
@Controller('company')
export class CompanyUsersController {
  constructor(private readonly users: CompanyUsersService) {}

  private actorIp(req: Request) {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip
    );
  }

  @Get('roles')
  @RequirePermissions('company.users.read')
  @ApiOperation({ summary: 'List assignable company-scope roles' })
  listRoles() {
    return this.users.listAssignableRoles();
  }

  @Get('users')
  @RequirePermissions('company.users.read')
  @ApiOperation({ summary: 'List users in current company' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListCompanyUsersQueryDto,
  ) {
    return this.users.list(requireCompanyId(user), q);
  }

  @Get('users/:id')
  @RequirePermissions('company.users.read')
  @ApiOperation({ summary: 'Get company user' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.get(requireCompanyId(user), id);
  }

  @Post('users')
  @RequirePermissions('company.users.write')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Create company user + roles' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCompanyUserDto,
    @Req() req: Request,
  ) {
    return this.users.create(requireCompanyId(user), dto, {
      id: user.id,
      ip: this.actorIp(req),
    });
  }

  @Patch('users/:id')
  @RequirePermissions('company.users.write')
  @ApiOperation({ summary: 'Update company user' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyUserDto,
    @Req() req: Request,
  ) {
    return this.users.update(requireCompanyId(user), id, dto, {
      id: user.id,
      ip: this.actorIp(req),
    });
  }
}
