import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { PIPELINE_QUEUE } from './pipeline.constants';
import { SEND_QUEUE } from '../campaigns/queue.constants';
import { PipelineService } from './pipeline.service';
import { PipelineProcessor } from './pipeline.processor';
import { CampaignCountersService } from './campaign-counters.service';
import { CompanyResearchService } from './stages/company-research.service';
import { RivalsService } from './stages/rivals.service';
import { AnalysisService } from './stages/analysis.service';
import { AuditsModule } from '../audits/audits.module';
import { AuditsController } from '../audits/audits.controller';
import { ScraperModule } from '../scraper/scraper.module';
import { AiModule } from '../ai/ai.module';
import { LlmAccountsModule } from '../llm-accounts/llm-accounts.module';
import { SettingsModule } from '../settings/settings.module';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';

/**
 * The lead audit pipeline: queue wiring, the stage services, and (on worker
 * processes only) the BullMQ processor that executes stages. API processes
 * import this module too — they enqueue work and serve audit reads, but the
 * processor is simply not instantiated there.
 */
const isWorkerProcess = (process.env.APP_ROLE ?? 'all') !== 'api';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    BullModule.registerQueue({ name: PIPELINE_QUEUE }, { name: SEND_QUEUE }),
    AuditsModule,
    ScraperModule,
    AiModule,
    LlmAccountsModule,
    SettingsModule,
  ],
  controllers: [AuditsController],
  providers: [
    PipelineService,
    CampaignCountersService,
    CompanyResearchService,
    RivalsService,
    AnalysisService,
    ...(isWorkerProcess ? [PipelineProcessor] : []),
  ],
  exports: [PipelineService, CampaignCountersService, BullModule],
})
export class PipelineModule {}
