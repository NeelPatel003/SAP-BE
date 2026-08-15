import {
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { requireCompanyId } from '../../common/utils/tenant';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('auth.login')
  list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.notifications.list(requireCompanyId(user), user.id, {
      unreadOnly: unreadOnly === '1' || unreadOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 30,
    });
  }

  @Post('read-all')
  @RequirePermissions('auth.login')
  markAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(requireCompanyId(user), user.id);
  }

  @Post(':id/read')
  @RequirePermissions('auth.login')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(requireCompanyId(user), user.id, id);
  }
}
