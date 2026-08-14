import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { LeadsModule } from './leads/leads.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { EmailAgentModule } from './email-agent/email-agent.module';
import { SettingsModule } from './settings/settings.module';
import { SmtpAccountsModule } from './smtp-accounts/smtp-accounts.module';
import { LlmAccountsModule } from './llm-accounts/llm-accounts.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { AuditsModule } from './audits/audits.module';
import { ScraperModule } from './scraper/scraper.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('app.mongoUri'),
      }),
    }),
    // Shared Redis connection for the BullMQ queues that distribute pipeline
    // work and campaign sends across every worker replica.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('app.redis.host'),
          port: config.get<number>('app.redis.port'),
        },
      }),
    }),
    CommonModule,
    RedisModule,
    LeadsModule,
    AuditsModule,
    ScraperModule,
    AiModule,
    PipelineModule,
    CampaignsModule,
    EmailAgentModule,
    SettingsModule,
    SmtpAccountsModule,
    LlmAccountsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
