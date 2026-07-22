import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument, LeadStatus } from './lead.schema';
import { ParsedLeadRow } from './lead-parser';
import { QueryLeadsDto } from './dto/query-leads.dto';

export interface ImportSummary {
  imported: number;
  skipped: number;
  leads: LeadDocument[];
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
  ) {}

  /** Persist a batch of parsed rows as `pending` leads. */
  async importRows(
    rows: ParsedLeadRow[],
    skipped: number,
  ): Promise<ImportSummary> {
    if (rows.length === 0) {
      return { imported: 0, skipped, leads: [] };
    }

    const docs = rows.map((row) => ({
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
      title: row.title,
      status: LeadStatus.Pending,
      errorMessage: null,
      sentAt: null,
      campaignId: null,
    }));

    const leads = await this.leadModel.insertMany(docs);
    this.logger.log(`Imported ${leads.length} leads (skipped ${skipped}).`);
    return { imported: leads.length, skipped, leads: leads as LeadDocument[] };
  }

  async findAll(query: QueryLeadsDto): Promise<LeadDocument[]> {
    const filter: Record<string, unknown> = {};
    if (query.campaignId) filter.campaignId = new Types.ObjectId(query.campaignId);
    if (query.status) filter.status = query.status;
    return this.leadModel.find(filter).sort({ createdAt: 1 }).exec();
  }

  async findByCampaign(campaignId: string): Promise<LeadDocument[]> {
    return this.leadModel
      .find({ campaignId: new Types.ObjectId(campaignId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findPending(): Promise<LeadDocument[]> {
    return this.leadModel
      .find({ status: LeadStatus.Pending, campaignId: null })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Remove all leads — used to reset the demo. */
  async clearAll(): Promise<{ deleted: number }> {
    const res = await this.leadModel.deleteMany({}).exec();
    this.logger.log(`Cleared ${res.deletedCount ?? 0} leads.`);
    return { deleted: res.deletedCount ?? 0 };
  }
}
