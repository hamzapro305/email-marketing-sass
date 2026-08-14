import { Module } from '@nestjs/common';
import { AiClientService } from './ai-client.service';
import { LocalFallbacksService } from './local-fallbacks.service';
import { FallbackEmailWriterService } from './fallback-email-writer.service';
import { EmailComposeService } from './email-compose.service';

/**
 * Everything that talks to (or stands in for) the AI service lives here:
 * the typed HTTP client, the email composer, and the deterministic local
 * fallbacks used when the service is down. AI is a dependency of the
 * pipeline, never a hard one.
 */
@Module({
  providers: [
    AiClientService,
    LocalFallbacksService,
    FallbackEmailWriterService,
    EmailComposeService,
  ],
  exports: [
    AiClientService,
    LocalFallbacksService,
    FallbackEmailWriterService,
    EmailComposeService,
  ],
})
export class AiModule {}
