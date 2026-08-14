import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from './campaign.schema';
import { CampaignFile, CampaignFileSchema } from './campaign-file.schema';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { SendProcessor } from './send.processor';
import { LeadsModule } from '../leads/leads.module';
import { EmailAgentModule } from '../email-agent/email-agent.module';
import { SettingsModule } from '../settings/settings.module';
import { SmtpAccountsModule } from '../smtp-accounts/smtp-accounts.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { AiModule } from '../ai/ai.module';
import { SuppressionsModule } from '../suppressions/suppressions.module';

/**
 * Campaign CRUD + file uploads + the send worker. Starting a campaign hands
 * its leads to the audit pipeline (PipelineModule); the SendProcessor here
 * consumes the send queue that the pipeline's final stage feeds.
 */
const isWorkerProcess = (process.env.APP_ROLE ?? 'all') !== 'api';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignFile.name, schema: CampaignFileSchema },
    ]),
    LeadsModule,
    EmailAgentModule,
    SettingsModule,
    SmtpAccountsModule,
    PipelineModule,
    AiModule,
    SuppressionsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, ...(isWorkerProcess ? [SendProcessor] : [])],
})
export class CampaignsModule {}
