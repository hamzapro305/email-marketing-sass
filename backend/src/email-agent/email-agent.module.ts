import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, IEmailSender } from './email-sender.interface';
import { DemoEmailSender } from './demo-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';
import { EmailMode, SmtpConfig } from '../config/configuration';

/**
 * The ONLY place in the codebase that reads EMAIL_MODE. A custom factory
 * provider resolves the correct IEmailSender implementation at startup, so no
 * other module ever branches on the flag. Switching demo <-> live is purely a
 * matter of the env value.
 */
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IEmailSender => {
        const logger = new Logger('EmailAgent');
        const mode = config.get<EmailMode>('app.emailMode') ?? 'demo';

        if (mode === 'live') {
          const smtp = config.get<SmtpConfig>('app.smtp') as SmtpConfig;
          logger.log(`EMAIL_MODE=live — using SMTP sender (${smtp.host}).`);
          return new SmtpEmailSender(smtp);
        }

        logger.log('EMAIL_MODE=demo — using simulated demo sender (no network).');
        return new DemoEmailSender();
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailAgentModule {}
