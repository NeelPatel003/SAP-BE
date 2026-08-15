import { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export const ACCESS_COOKIE = 'teamora_access';
export const REFRESH_COOKIE = 'teamora_refresh';
export const CSRF_COOKIE = 'teamora_csrf';
export const CSRF_HEADER = 'x-csrf-token';

function resolveSameSite(
  config: ConfigService,
): 'lax' | 'strict' | 'none' {
  const raw = (config.get<string>('COOKIE_SAMESITE') || '').toLowerCase();
  if (raw === 'none' || raw === 'lax' || raw === 'strict') {
    return raw;
  }
  // Split FE/BE hosts (Vercel + Render) need SameSite=None so credentialed
  // cross-origin fetch sends cookies. Localhost same-site keeps lax.
  const nodeEnv = config.get<string>('NODE_ENV') || process.env.NODE_ENV;
  return nodeEnv === 'production' ? 'none' : 'lax';
}

function baseCookieOptions(config: ConfigService): CookieOptions {
  const nodeEnv = config.get<string>('NODE_ENV') || process.env.NODE_ENV;
  const sameSite = resolveSameSite(config);
  const secure =
    sameSite === 'none' ||
    nodeEnv === 'production' ||
    config.get<string>('COOKIE_SECURE') === 'true';
  const domain = config.get<string>('COOKIE_DOMAIN') || undefined;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

function csrfCookieOptions(config: ConfigService): CookieOptions {
  return {
    ...baseCookieOptions(config),
    httpOnly: false,
  };
}

export function parseJwtAccessMaxAgeMs(config: ConfigService): number {
  const raw = config.get<string>('JWT_ACCESS_EXPIRES') || '15m';
  return durationToMs(raw, 15 * 60 * 1000);
}

export function parseJwtRefreshMaxAgeMs(config: ConfigService): number {
  const raw = config.get<string>('JWT_REFRESH_EXPIRES') || '7d';
  return durationToMs(raw, 7 * 24 * 60 * 60 * 1000);
}

function durationToMs(value: string, fallback: number): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return fallback;
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
  return n * mult;
}

export function mintCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string },
  csrfToken?: string,
) {
  const base = baseCookieOptions(config);
  const csrf = csrfToken || mintCsrfToken();

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: parseJwtAccessMaxAgeMs(config),
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    // Readable by all /auth/* routes including login follow-ups
    path: '/auth',
    maxAge: parseJwtRefreshMaxAgeMs(config),
  });

  res.cookie(CSRF_COOKIE, csrf, {
    ...csrfCookieOptions(config),
    maxAge: parseJwtRefreshMaxAgeMs(config),
  });

  return csrf;
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = baseCookieOptions(config);
  const csrfOpts = csrfCookieOptions(config);

  res.clearCookie(ACCESS_COOKIE, { ...base, maxAge: 0 });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/auth', maxAge: 0 });
  res.clearCookie(CSRF_COOKIE, { ...csrfOpts, maxAge: 0 });
}

export function getCookie(
  req: { cookies?: Record<string, string> },
  name: string,
): string | undefined {
  return req.cookies?.[name];
}
