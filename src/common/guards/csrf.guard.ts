import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
} from '../../modules/auth/auth-cookies';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF for cookie sessions.
 * Skips: safe methods, Authorization Bearer tooling, requests with no auth cookies.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method || 'GET').toUpperCase();

    if (SAFE.has(method)) {
      return true;
    }

    // Login always establishes a new session; do not require prior CSRF
    const path = (req.path || req.url || '').split('?')[0];
    if (path === '/auth/login' || path.endsWith('/auth/login')) {
      return true;
    }

    const authHeader = req.headers.authorization || '';
    if (
      typeof authHeader === 'string' &&
      authHeader.toLowerCase().startsWith('bearer ')
    ) {
      return true;
    }

    const hasCookieSession = Boolean(
      req.cookies?.[ACCESS_COOKIE] ||
        req.cookies?.[REFRESH_COOKIE] ||
        req.cookies?.[CSRF_COOKIE],
    );

    if (!hasCookieSession) {
      return true;
    }

    const header = req.headers[CSRF_HEADER];
    const headerVal = Array.isArray(header) ? header[0] : header;
    const cookieVal = req.cookies?.[CSRF_COOKIE];

    if (
      !headerVal ||
      !cookieVal ||
      typeof headerVal !== 'string' ||
      headerVal !== cookieVal
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }
}
