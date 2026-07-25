import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from './campaign.schema';
import { CampaignFile, CampaignFileSchema } from './campaign-file.schema';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { SendProcessor } from './send.processor';
import { SEND_QUEUE } from './queue.constants';
import { LeadsModule } from '../leads/leads.module';
import { EmailAgentModule } from '../email-agent/email-agent.module';
import { EmailWriterModule } from '../email-writer/email-writer.module';
import { SettingsModule } from '../settings/settings.module';
import { SmtpAccountsModule } from '../smtp-accounts/smtp-accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignFile.name, schema: CampaignFileSchema },
    ]),
    BullModule.registerQueue({ name: SEND_QUEUE }),
    LeadsModule,
    EmailAgentModule,
    EmailWriterModule,
    SettingsModule,
    SmtpAccountsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, SendProcessor],
})
export class CampaignsModule {}
