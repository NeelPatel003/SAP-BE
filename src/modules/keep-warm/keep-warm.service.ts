import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Self-ping /health every 5 minutes while the process is running.
 * Use the public Render URL so the request counts as inbound traffic
 * and delays free-tier spin-down. Does nothing once the instance is asleep —
 * pair with GitHub keep-warm or a paid instance for first wake.
 */
@Injectable()
export class KeepWarmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepWarmService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const enabledRaw = (
      this.config.get<string>('KEEP_WARM_ENABLED') || ''
    ).toLowerCase();
    const nodeEnv =
      this.config.get<string>('NODE_ENV') || process.env.NODE_ENV || '';
    const enabled =
      enabledRaw === 'true' ||
      (enabledRaw !== 'false' && nodeEnv === 'production');

    if (!enabled) {
      this.logger.log('Keep-warm cron disabled');
      return;
    }

    const url = this.resolveHealthUrl();
    this.logger.log(`Keep-warm cron every 5m → ${url}`);

    // First ping shortly after boot (DB already warming)
    setTimeout(() => {
      void this.ping(url);
    }, 15_000);

    this.timer = setInterval(() => {
      void this.ping(url);
    }, FIVE_MIN_MS);
    // Don't keep the process alive solely because of this timer on local exit
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveHealthUrl(): string {
    const explicit =
      this.config.get<string>('KEEP_WARM_URL') ||
      this.config.get<string>('RENDER_HEALTH_URL');
    if (explicit?.trim()) {
      return explicit.trim().replace(/\/$/, '');
    }

    const host =
      this.config.get<string>('RENDER_EXTERNAL_HOSTNAME') ||
      process.env.RENDER_EXTERNAL_HOSTNAME;
    if (host?.trim()) {
      return `https://${host.trim()}/health`;
    }

    const port = this.config.get<string>('PORT') || process.env.PORT || '4000';
    return `http://127.0.0.1:${port}/health`;
  }

  private async ping(url: string) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        this.logger.warn(`Keep-warm ping ${res.status} ${url}`);
        return;
      }
      this.logger.debug(`Keep-warm ok ${url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Keep-warm ping failed: ${msg}`);
    }
  }
}
