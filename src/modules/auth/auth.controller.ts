import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';
import {
  clearAuthCookies,
  getCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth-cookies';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private clientMeta(req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    const userAgent = req.headers['user-agent'] || null;
    return { ip, userAgent };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login; sets httpOnly session cookies' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, this.clientMeta(req));
    const csrfToken = setAuthCookies(res, this.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return { user: result.user, csrfToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh access session from refresh cookie (or body for tooling)',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      getCookie(req, REFRESH_COOKIE) || dto?.refreshToken || '';
    const tokens = await this.auth.refresh(refreshToken, this.clientMeta(req));
    const csrfToken = setAuthCookies(res, this.config, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return { ok: true, csrfToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout current session only; clear cookies',
  })
  async logout(
    @Body() body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refresh =
      getCookie(req, REFRESH_COOKIE) || body?.refreshToken || undefined;
    await this.auth.logoutCurrent(refresh);
    clearAuthCookies(res, this.config);
    return { success: true };
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all refresh sessions for this user' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user.id);
    clearAuthCookies(res, this.config);
    return { success: true };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for current user' })
  listSessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const refresh = getCookie(req, REFRESH_COOKIE) || undefined;
    return this.auth.listSessions(user.id, refresh);
  }

  @Post('sessions/:id/revoke')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one session by id' })
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.auth.revokeSession(user.id, id);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, roles, permissions' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
