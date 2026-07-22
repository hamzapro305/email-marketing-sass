import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument, CampaignStatus } from './campaign.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import {
  EMAIL_SENDER,
  IEmailSender,
} from '../email-agent/email-sender.interface';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly concurrency: number;

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
    config: ConfigService,
  ) {
    this.concurrency = config.get<number>('app.sendConcurrency') ?? 3;
  }

  /**
   * Create a campaign from all currently-pending, unassigned leads and kick off
   * the run in the background. Returns immediately so the frontend can poll.
   */
  async createAndStart(dto: CreateCampaignDto): Promise<CampaignDocument> {
    const pending = await this.leadModel
      .find({ status: LeadStatus.Pending, campaignId: null })
      .sort({ createdAt: 1 })
      .exec();

    const campaign = await this.campaignModel.create({
      name: dto.name?.trim() || `Campaign ${new Date().toISOString()}`,
      status: CampaignStatus.Draft,
      totalLeads: pending.length,
      sentCount: 0,
      failedCount: 0,
      startedAt: null,
      completedAt: null,
    });

    // Assign the pending leads to this campaign up front.
    if (pending.length > 0) {
      await this.leadModel.updateMany(
        { _id: { $in: pending.map((l) => l._id) } },
        { $set: { campaignId: campaign._id } },
      );
    }

    // Fire-and-forget the processing loop; errors are captured on the campaign.
    void this.runCampaign(campaign._id.toString()).catch((err) => {
      this.logger.error(
        `Campaign ${campaign._id} crashed: ${err?.message ?? err}`,
      );
    });

    return campaign;
  }

  async findOne(id: string): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    return campaign;
  }

  async findLeads(id: string): Promise<LeadDocument[]> {
    await this.findOne(id); // 404 if the campaign doesn't exist
    return this.leadModel
      .find({ campaignId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * The orchestration loop. Transitions the campaign to `running`, processes
   * leads with a bounded worker pool (SEND_CONCURRENCY), updates per-lead status
   * and campaign counters after each result, then marks the campaign completed.
   */
  private async runCampaign(id: string): Promise<void> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) return;

    if (campaign.totalLeads === 0) {
      campaign.status = CampaignStatus.Completed;
      campaign.startedAt = new Date();
      campaign.completedAt = new Date();
      await campaign.save();
      this.logger.warn(`Campaign ${id} had no pending leads — completed empty.`);
      return;
    }

    campaign.status = CampaignStatus.Running;
    campaign.startedAt = new Date();
    await campaign.save();
    this.logger.log(
      `▶ Campaign ${id} started — ${campaign.totalLeads} leads, concurrency ${this.concurrency}.`,
    );

    const leads = await this.leadModel
      .find({ campaignId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .exec();

    // Simple bounded worker pool: N workers pull from a shared index.
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, leads.length);

    const worker = async (): Promise<void> => {
      while (true) {
        const index = cursor++;
        if (index >= leads.length) return;
        await this.processLead(leads[index], id);
      }
    };

    try {
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const fresh = await this.campaignModel.findById(id).exec();
      if (fresh) {
        fresh.status = CampaignStatus.Completed;
        fresh.completedAt = new Date();
        await fresh.save();
        this.logger.log(
          `■ Campaign ${id} completed — sent ${fresh.sentCount}, failed ${fresh.failedCount}.`,
        );
      }
    } catch (err) {
      const fresh = await this.campaignModel.findById(id).exec();
      if (fresh) {
        fresh.status = CampaignStatus.Failed;
        fresh.completedAt = new Date();
        await fresh.save();
      }
      this.logger.error(`Campaign ${id} failed: ${(err as Error)?.message}`);
    }
  }

  /** Process a single lead: pending -> sending -> sent/failed, updating counters. */
  private async processLead(lead: LeadDocument, campaignId: string): Promise<void> {
    lead.status = LeadStatus.Sending;
    lead.errorMessage = null;
    await lead.save();

    const result = await this.emailSender.sendToLead(lead);

    if (result.success) {
      lead.status = LeadStatus.Sent;
      lead.sentAt = new Date();
      lead.errorMessage = null;
      await lead.save();
      await this.campaignModel.updateOne(
        { _id: campaignId },
        { $inc: { sentCount: 1 } },
      );
    } else {
      lead.status = LeadStatus.Failed;
      lead.errorMessage = result.error ?? 'Unknown error';
      await lead.save();
      await this.campaignModel.updateOne(
        { _id: campaignId },
        { $inc: { failedCount: 1 } },
      );
    }
  }
}
