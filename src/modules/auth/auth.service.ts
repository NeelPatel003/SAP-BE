import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/auth.dto';

const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_MAX = 8;
const MAX_ACTIVE_REFRESH_TOKENS = 20;
const REFRESH_GRACE_MS = 30_000;

type SessionMeta = {
  ip?: string | null;
  userAgent?: string | null;
  label?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private async assertNotLockedOut(email: string, ip?: string | null) {
    const normalized = email.toLowerCase();
    const since = new Date(Date.now() - LOGIN_FAIL_WINDOW_MS);
    const recent = await this.prisma.auditLog.findMany({
      where: {
        event: 'login_failed',
        success: false,
        createdAt: { gte: since },
      },
      select: { meta: true, ip: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    let byEmail = 0;
    for (const row of recent) {
      const meta = row.meta as { email?: string } | null;
      const rowEmail =
        typeof meta?.email === 'string' ? meta.email.toLowerCase() : '';
      if (rowEmail === normalized) {
        byEmail += 1;
      }
    }

    if (byEmail >= LOGIN_FAIL_MAX) {
      await this.audit.writeAudit({
        event: 'login_failed',
        success: false,
        message: 'Locked out',
        ip,
        meta: { email: normalized },
      });
      throw new HttpException(
        'Too many failed attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async login(dto: LoginDto, meta: SessionMeta = {}) {
    const email = dto.email.toLowerCase();
    await this.assertNotLockedOut(email, meta.ip);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        company: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      await this.audit.writeAudit({
        event: 'login_failed',
        success: false,
        message: 'Unknown email',
        ip: meta.ip,
        meta: { email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'active') {
      await this.audit.writeAudit({
        event: 'login_failed',
        success: false,
        message: 'User inactive',
        userId: user.id,
        companyId: user.companyId,
        ip: meta.ip,
        meta: { email },
      });
      throw new ForbiddenException('Account is not active');
    }

    if (user.company && user.company.status === 'suspended') {
      await this.audit.writeAudit({
        event: 'login_failed',
        success: false,
        message: 'Company suspended',
        userId: user.id,
        companyId: user.companyId,
        ip: meta.ip,
        meta: { email },
      });
      throw new ForbiddenException('Company is suspended');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.audit.writeAudit({
        event: 'login_failed',
        success: false,
        message: 'Bad password',
        userId: user.id,
        companyId: user.companyId,
        ip: meta.ip,
        meta: { email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.pruneTokens(user.id);

    const tokens = await this.issueTokens(user.id, user.email, {
      ...meta,
      familyId: crypto.randomUUID(),
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.writeAudit({
      event: 'login_success',
      success: true,
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
      meta: { email },
    });

    await this.audit.writeActivity({
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
    });

    return {
      ...tokens,
      user: this.serializeUser(user),
    };
  }

  async refresh(refreshToken: string, meta: SessionMeta = {}) {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.user.status !== 'active') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Grace: concurrent tabs reused an already-rotated token — rotate from family tip
    if (stored.revokedAt && stored.familyId) {
      const age = Date.now() - stored.revokedAt.getTime();
      if (age <= REFRESH_GRACE_MS) {
        const tip = await this.prisma.refreshToken.findFirst({
          where: {
            familyId: stored.familyId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        });
        if (tip && tip.user.status === 'active') {
          return this.rotateFromStored(tip, meta);
        }
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.rotateFromStored(stored, meta);
  }

  private async rotateFromStored(
    stored: {
      id: string;
      userId: string;
      familyId: string;
      user: { id: string; email: string; status: string };
    },
    meta: SessionMeta,
  ) {
    const tokens = await this.issueTokens(stored.user.id, stored.user.email, {
      ...meta,
      familyId: stored.familyId,
    });

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedById: tokens.refreshTokenId,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
    };
  }

  /** Logout current session only (requires refresh token). */
  async logoutCurrent(refreshToken?: string) {
    if (!refreshToken) {
      return { success: true };
    }
    return this.logoutByRefreshToken(refreshToken);
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.writeAudit({
      event: 'logout_all',
      success: true,
      userId,
    });
    return { success: true };
  }

  /** Revoke by refresh token alone (expired access cookie / public logout). */
  async logoutByRefreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (stored) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.writeAudit({
        event: 'logout',
        success: true,
        userId: stored.userId,
      });
    }
    return { success: true };
  }

  async listSessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken
      ? this.hashToken(currentRefreshToken)
      : null;
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      ip: r.ip,
      userAgent: r.userAgent,
      label: r.label,
      current: currentHash ? r.tokenHash === currentHash : false,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const row = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!row) throw new NotFoundException('Session not found');
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    return this.serializeUser(user);
  }

  private async pruneTokens(userId: string) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null, lt: cutoff } },
        ],
      },
    });

    const active = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const overflow = active.length - (MAX_ACTIVE_REFRESH_TOKENS - 1);
    if (overflow > 0) {
      const toRevoke = active.slice(0, overflow).map((r) => r.id);
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: toRevoke } },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    opts: SessionMeta & { familyId: string },
  ) {
    const payload = { sub: userId, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRES') || '15m') as
        | `${number}m`
        | `${number}s`
        | `${number}h`
        | `${number}d`,
    });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d';
    const expiresAt = this.parseExpiry(expiresIn);
    const label =
      opts.label ||
      this.guessLabel(opts.userAgent) ||
      null;

    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        familyId: opts.familyId,
        userAgent: opts.userAgent?.slice(0, 512) || null,
        ip: opts.ip?.slice(0, 64) || null,
        label,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      tokenType: 'Bearer' as const,
    };
  }

  private guessLabel(ua?: string | null) {
    if (!ua) return null;
    const lower = ua.toLowerCase();
    if (lower.includes('iphone') || lower.includes('android')) return 'Mobile';
    if (lower.includes('ipad') || lower.includes('tablet')) return 'Tablet';
    if (lower.includes('macintosh') || lower.includes('windows') || lower.includes('linux'))
      return 'Desktop';
    return 'Browser';
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(value: string): Date {
    const match = /^(\d+)([smhd])$/.exec(value);
    const now = Date.now();
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const mult =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60 * 1000
          : unit === 'h'
            ? 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
    return new Date(now + n * mult);
  }

  private serializeUser(
    user: {
      id: string;
      email: string;
      name: string;
      status: string;
      companyId: string | null;
      lastLoginAt: Date | null;
      company: {
        id: string;
        name: string;
        slug: string;
        status: string;
        enabledModules?: unknown;
        displayName?: string | null;
        logoUrl?: string | null;
        primaryColor?: string | null;
        secondaryColor?: string | null;
        settings?: unknown;
      } | null;
      userRoles: {
        role: {
          code: string;
          name: string;
          rolePermissions: { permission: { code: string } }[];
        };
      }[];
    },
  ) {
    const roles = user.userRoles.map((ur) => ({
      code: ur.role.code,
      name: ur.role.name,
    }));
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      companyId: user.companyId,
      company: user.company
        ? (() => {
            const c = user.company as {
              id: string;
              name: string;
              slug: string;
              status: string;
              enabledModules?: unknown;
              displayName?: string | null;
              logoUrl?: string | null;
              primaryColor?: string | null;
              secondaryColor?: string | null;
              settings?: unknown;
            };
            const store =
              c.settings && typeof c.settings === 'object'
                ? (c.settings as { layoutDensity?: string })
                : {};
            return {
              id: c.id,
              name: c.name,
              slug: c.slug,
              status: c.status,
              enabledModules: c.enabledModules,
              displayName: c.displayName || c.name,
              logoUrl: c.logoUrl ?? null,
              primaryColor: c.primaryColor || '#f97316',
              secondaryColor: c.secondaryColor || '#0f172a',
              layoutDensity:
                store.layoutDensity === 'compact' ? 'compact' : 'comfortable',
            };
          })()
        : null,
      roles,
      permissions,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
