import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument, CampaignStatus } from './campaign.schema';
import { CampaignFile, CampaignFileDocument } from './campaign-file.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { parseFile } from '../leads/lead-parser';
import { SmtpAccountsService } from '../smtp-accounts/smtp-accounts.service';
import { PipelineService } from '../pipeline/pipeline.service';

export interface UploadedFileType {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const INSERT_CHUNK = 2_000;

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignFile.name)
    private readonly fileModel: Model<CampaignFileDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly smtpAccounts: SmtpAccountsService,
    private readonly pipeline: PipelineService,
  ) {}

  /** Create a campaign as a draft — no leads yet, nothing sent. */
  async create(
    sessionId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.create({
      name: dto.name?.trim() || `Campaign ${new Date().toLocaleString()}`,
      description: dto.description?.trim() ?? '',
      sessionId,
      status: CampaignStatus.Draft,
      totalLeads: 0,
      sentCount: 0,
      failedCount: 0,
      startedAt: null,
      completedAt: null,
    });
    this.logger.log(`Session ${sessionId}: created campaign "${campaign.name}".`);
    return campaign;
  }

  /** All campaigns for a session, newest first. */
  async list(sessionId: string): Promise<CampaignDocument[]> {
    return this.campaignModel
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
  }

  /** One campaign (scoped to the session). */
  async findOne(sessionId: string, id: string): Promise<CampaignDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    const campaign = await this.campaignModel
      .findOne({ _id: new Types.ObjectId(id), sessionId })
      .exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    return campaign;
  }

  /**
   * Upload a CSV/XLSX into a campaign: parse, validate, normalize, and store
   * rows as `pending` leads. Deduplication is two-layered: within the file
   * (parser drops repeated emails) and against the campaign (a unique index on
   * campaignId+email makes `insertMany` skip rows that already exist).
   */
  async uploadLeads(
    sessionId: string,
    id: string,
    file: UploadedFileType,
  ): Promise<{
    file: CampaignFileDocument;
    imported: number;
    skipped: number;
    duplicates: number;
  }> {
    const campaign = await this.findOne(sessionId, id);
    if (campaign.status === CampaignStatus.Running) {
      throw new BadRequestException(
        'Cannot add leads while the campaign is running.',
      );
    }
    if (!file?.buffer) {
      throw new BadRequestException('No file provided (field name must be "file").');
    }

    const { rows, skipped, duplicates: fileDuplicates } = parseFile(
      file.originalname,
      file.mimetype,
      file.buffer,
    );

    const fileDoc = await this.fileModel.create({
      campaignId: campaign._id,
      sessionId,
      originalName: file.originalname,
      size: file.size ?? file.buffer.length,
      leadCount: 0,
      skipped,
    });

    let inserted = 0;
    let dbDuplicates = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({
        ...row,
        status: LeadStatus.Pending,
        errorMessage: null,
        sentAt: null,
        campaignId: campaign._id,
        sessionId,
        fileId: fileDoc._id,
      }));
      try {
        const docs = await this.leadModel.insertMany(chunk, { ordered: false });
        inserted += docs.length;
      } catch (err) {
        // Duplicate-key errors are expected (lead already in this campaign);
        // with ordered:false everything else in the batch was still inserted.
        const bulkErr = err as {
          code?: number;
          message?: string;
          insertedDocs?: unknown[];
          result?: { insertedCount?: number };
        };
        const isDuplicateError =
          bulkErr.code === 11000 || /E11000/.test(bulkErr.message ?? '');
        if (!isDuplicateError) throw err;
        const okCount =
          bulkErr.result?.insertedCount ?? bulkErr.insertedDocs?.length ?? 0;
        inserted += okCount;
        dbDuplicates += chunk.length - okCount;
      }
    }

    fileDoc.leadCount = inserted;
    await fileDoc.save();
    await this.recountTotal(campaign._id);

    const duplicates = fileDuplicates + dbDuplicates;
    this.logger.log(
      `Campaign ${id}: added "${file.originalname}" — ${inserted} leads ` +
        `(skipped ${skipped} invalid, ${duplicates} duplicates).`,
    );
    return { file: fileDoc, imported: inserted, skipped, duplicates };
  }

  /** Files uploaded to a campaign, newest first, with live pending counts. */
  async listFiles(
    sessionId: string,
    id: string,
  ): Promise<Array<CampaignFileDocument & { pendingCount: number }>> {
    const campaign = await this.findOne(sessionId, id);
    const files = await this.fileModel
      .find({ campaignId: campaign._id })
      .sort({ createdAt: -1 })
      .exec();

    const counts = await this.leadModel.aggregate<{
      _id: Types.ObjectId;
      pending: number;
    }>([
      {
        $match: {
          campaignId: campaign._id,
          status: LeadStatus.Pending,
        },
      },
      { $group: { _id: '$fileId', pending: { $sum: 1 } } },
    ]);
    const pendingByFile = new Map(
      counts.map((c) => [c._id?.toString(), c.pending]),
    );

    return files.map((f) => {
      const obj = f.toObject() as CampaignFileDocument & { pendingCount: number };
      obj.pendingCount = pendingByFile.get(f._id.toString()) ?? 0;
      return obj;
    });
  }

  /** Delete a file and its not-yet-sent leads from a campaign. */
  async deleteFile(
    sessionId: string,
    id: string,
    fileId: string,
  ): Promise<{ deletedLeads: number }> {
    const campaign = await this.findOne(sessionId, id);
    if (campaign.status === CampaignStatus.Running) {
      throw new BadRequestException(
        'Cannot delete files while the campaign is running.',
      );
    }
    if (!Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Invalid file id.');
    }
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(fileId), campaignId: campaign._id })
      .exec();
    if (!file) {
      throw new NotFoundException('File not found in this campaign.');
    }

    // Only remove leads that haven't been sent (keep run history intact).
    const res = await this.leadModel
      .deleteMany({
        fileId: file._id,
        status: { $in: [LeadStatus.Pending, LeadStatus.Failed, LeadStatus.Ready] },
      })
      .exec();
    await this.fileModel.deleteOne({ _id: file._id }).exec();
    await this.recountTotal(campaign._id);

    this.logger.log(
      `Campaign ${id}: deleted file "${file.originalName}" (${res.deletedCount ?? 0} leads).`,
    );
    return { deletedLeads: res.deletedCount ?? 0 };
  }

  /**
   * Start (or re-run) a campaign: every pending lead enters the audit pipeline
   * (research → rivals → scraping → analysis → email), and each finished audit
   * hands its lead to the send queue. Returns immediately — the workers process
   * everything even if the frontend is closed.
   */
  async start(sessionId: string, id: string): Promise<CampaignDocument> {
    const campaign = await this.findOne(sessionId, id);
    if (campaign.status === CampaignStatus.Running) {
      throw new BadRequestException('Campaign is already running.');
    }

    // Sending requires a configured SMTP account for this session.
    await this.smtpAccounts.assertConfigured(sessionId);

    // A re-run gives previously-failed (and audited-but-unsent) leads a fresh
    // pass; already-sent leads are never re-sent.
    await this.leadModel
      .updateMany(
        {
          campaignId: campaign._id,
          status: { $in: [LeadStatus.Failed, LeadStatus.Ready] },
        },
        { $set: { status: LeadStatus.Pending, errorMessage: null } },
      )
      .exec();

    const toRun = await this.leadModel
      .find({ campaignId: campaign._id, status: LeadStatus.Pending })
      .select('_id campaignId sessionId')
      .lean()
      .exec();
    if (toRun.length === 0) {
      throw new BadRequestException('No pending leads to send. Add leads first.');
    }

    // Recompute counters from the DB so a re-run keeps already-sent leads
    // counted and completion detection stays correct.
    const [total, sent] = await Promise.all([
      this.leadModel.countDocuments({ campaignId: campaign._id }).exec(),
      this.leadModel
        .countDocuments({ campaignId: campaign._id, status: LeadStatus.Sent })
        .exec(),
    ]);

    campaign.status = CampaignStatus.Running;
    campaign.totalLeads = total;
    campaign.sentCount = sent;
    campaign.failedCount = 0;
    campaign.startedAt = new Date();
    campaign.completedAt = null;
    await campaign.save();

    // Immediately reflect that these leads are in the pipeline. Workers then
    // move each one through researching → analyzing → writing → sending.
    await this.leadModel
      .updateMany(
        { _id: { $in: toRun.map((l) => l._id) } },
        { $set: { status: LeadStatus.Queued, errorMessage: null } },
      )
      .exec();

    const runId = new Types.ObjectId().toString();
    await this.pipeline.startForCampaign(
      campaign._id.toString(),
      sessionId,
      toRun as Array<Pick<LeadDocument, '_id' | 'campaignId' | 'sessionId'>>,
      runId,
    );
    return campaign;
  }

  /** Leads belonging to a campaign, oldest first. */
  async findLeads(sessionId: string, id: string): Promise<LeadDocument[]> {
    const campaign = await this.findOne(sessionId, id);
    return this.leadModel
      .find({ campaignId: campaign._id })
      .sort({ createdAt: 1 })
      .limit(5000)
      .exec();
  }

  /** Delete a campaign and all of its leads + files. Not allowed mid-run. */
  async remove(sessionId: string, id: string): Promise<{ deleted: boolean }> {
    const campaign = await this.findOne(sessionId, id);
    if (campaign.status === CampaignStatus.Running) {
      throw new BadRequestException('Cannot delete a running campaign.');
    }
    await Promise.all([
      this.leadModel.deleteMany({ campaignId: campaign._id }).exec(),
      this.fileModel.deleteMany({ campaignId: campaign._id }).exec(),
    ]);
    await this.campaignModel.deleteOne({ _id: campaign._id }).exec();
    this.logger.log(`Campaign ${id} deleted.`);
    return { deleted: true };
  }

  /** Keep `totalLeads` in sync with the actual number of leads in the campaign. */
  private async recountTotal(campaignId: Types.ObjectId): Promise<void> {
    const total = await this.leadModel.countDocuments({ campaignId }).exec();
    await this.campaignModel
      .updateOne({ _id: campaignId }, { $set: { totalLeads: total } })
      .exec();
  }
}
