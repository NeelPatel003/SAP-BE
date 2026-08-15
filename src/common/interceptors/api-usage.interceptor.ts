import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthUser }>();
    const res = http.getResponse<Response>();

    const path = req.originalUrl?.split('?')[0] || req.url;
    if (path === '/health' || path.startsWith('/docs')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res, path, started),
        error: (err: { status?: number; statusCode?: number }) => {
          const statusCode = err?.status || err?.statusCode || res.statusCode || 500;
          void this.writeLog(req, path, statusCode, started);
        },
      }),
    );
  }

  private log(
    req: Request & { user?: AuthUser },
    res: Response,
    path: string,
    started: number,
  ) {
    void this.writeLog(req, path, res.statusCode, started);
  }

  private async writeLog(
    req: Request & { user?: AuthUser },
    path: string,
    statusCode: number,
    started: number,
  ) {
    try {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        null;
      await this.prisma.apiRequestLog.create({
        data: {
          method: req.method,
          path,
          statusCode,
          durationMs: Date.now() - started,
          userId: req.user?.id ?? null,
          companyId: req.user?.companyId ?? null,
          ip,
        },
      });
    } catch {
      // never break responses on logging failure
    }
  }
}
