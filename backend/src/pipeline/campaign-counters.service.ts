import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Campaign,
  CampaignDocument,
  CampaignStatus,
} from '../campaigns/campaign.schema';

/**
 * Atomic campaign progress counters, shared by the pipeline and send workers.
 * Each lead is counted exactly once (sent or failed); the conditional update
 * on `status: Running` guarantees only one replica flips a campaign to
 * `completed`, no matter how many workers finish leads simultaneously.
 */
@Injectable()
export class CampaignCountersService {
  private readonly logger = new Logger(CampaignCountersService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
  ) {}

  bumpSent(campaignId: string): Promise<void> {
    return this.bump(campaignId, { sentCount: 1 });
  }

  bumpFailed(campaignId: string): Promise<void> {
    return this.bump(campaignId, { failedCount: 1 });
  }

  private async bump(
    campaignId: string,
    inc: { sentCount?: number; failedCount?: number },
  ): Promise<void> {
    const updated = await this.campaignModel
      .findByIdAndUpdate(campaignId, { $inc: inc }, { new: true })
      .exec();
    if (!updated) return;

    const processed = updated.sentCount + updated.failedCount;
    if (processed >= updated.totalLeads) {
      const res = await this.campaignModel
        .updateOne(
          { _id: campaignId, status: CampaignStatus.Running },
          { $set: { status: CampaignStatus.Completed, completedAt: new Date() } },
        )
        .exec();
      if (res.modifiedCount > 0) {
        this.logger.log(
          `■ Campaign ${campaignId} completed — sent ${updated.sentCount}, failed ${updated.failedCount}.`,
        );
      }
    }
  }
}
