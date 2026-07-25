import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { LeadsModule } from './leads/leads.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { EmailAgentModule } from './email-agent/email-agent.module';
import { SettingsModule } from './settings/settings.module';
import { SmtpAccountsModule } from './smtp-accounts/smtp-accounts.module';
import { LlmAccountsModule } from './llm-accounts/llm-accounts.module';
import { HealthController } from './health.controller';

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
    // Shared Redis connection for the BullMQ queue that distributes sends
    // across every backend replica.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('app.redis.host'),
          port: config.get<number>('app.redis.port'),
        },
      }),
    }),
    LeadsModule,
    CampaignsModule,
    EmailAgentModule,
    SettingsModule,
    SmtpAccountsModule,
    LlmAccountsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
