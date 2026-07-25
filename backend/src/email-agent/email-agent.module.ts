import { Module } from '@nestjs/common';
import { MailSenderService } from './mail-sender.service';

/**
 * Provides the SMTP mail sender. Sending always uses the caller's configured
 * SMTP account (resolved per session) — there is no demo/simulated sender.
 */
@Module({
  providers: [MailSenderService],
  exports: [MailSenderService],
})
export class EmailAgentModule {}
