import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageMeterService } from '../usage/usage-meter.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly meter: UsageMeterService,
  ) {}

  async send(params: {
    companyId: string;
    userId?: string | null;
    to: string;
    subject: string;
    body: string;
  }) {
    await this.meter.assertWithinQuota(params.companyId, 'email.send', 1);

    const provider = this.config.get<string>('EMAIL_PROVIDER') || 'log';
    const from =
      this.config.get<string>('EMAIL_FROM') || 'noreply@teamora.local';

    if (provider === 'log') {
      this.logger.log(
        `[email] to=${params.to} from=${from} subject=${params.subject} body=${params.body.slice(0, 200)}`,
      );
    } else {
      // Hook for Resend/SES later; still log for MVP observability
      this.logger.warn(
        `EMAIL_PROVIDER=${provider} not fully configured; logging email to ${params.to}`,
      );
      this.logger.log(
        `[email] to=${params.to} subject=${params.subject}`,
      );
    }

    await this.meter.record({
      companyId: params.companyId,
      userId: params.userId,
      feature: 'email.send',
      provider,
      inputUnits: 1,
      outputUnits: 0,
      costMicros: 0,
      meta: { to: params.to, subject: params.subject },
    });

    return { ok: true };
  }
}
