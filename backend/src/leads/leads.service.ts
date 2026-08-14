import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from './lead.schema';

/** A lead enriched with the name of the campaign it belongs to. */
export interface LeadWithCampaign {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  website: string;
  phone: string;
  industry: string;
  location: string;
  linkedinUrl: string;
  companyDomain: string;
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  generatedSubject?: string | null;
  generatedBody?: string | null;
  campaignId: Types.ObjectId | null;
  campaignName: string | null;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PagedLeads {
  items: LeadWithCampaign[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 200;

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
  ) {}

  /**
   * Paged leads for a session, newest activity first. The campaign name is
   * joined only for the returned page, so listing stays fast at 10k+ leads.
   */
  async listAll(
    sessionId: string,
    opts: {
      campaignId?: string;
      status?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<PagedLeads> {
    const match: Record<string, unknown> = { sessionId };
    if (opts.campaignId && Types.ObjectId.isValid(opts.campaignId)) {
      match.campaignId = new Types.ObjectId(opts.campaignId);
    }
    if (opts.status) match.status = opts.status;
    if (opts.q?.trim()) {
      const q = opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      match.$or = [
        { email: { $regex: q, $options: 'i' } },
        { company: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
      ];
    }

    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? 50));

    const [items, total] = await Promise.all([
      this.leadModel.aggregate<LeadWithCampaign>([
        { $match: match },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        {
          $lookup: {
            from: 'campaigns',
            localField: 'campaignId',
            foreignField: '_id',
            as: 'campaign',
          },
        },
        {
          $addFields: {
            campaignName: {
              $ifNull: [{ $arrayElemAt: ['$campaign.name', 0] }, null],
            },
          },
        },
        { $project: { campaign: 0, __v: 0, generatedBody: 0 } },
      ]),
      this.leadModel.countDocuments(match).exec(),
    ]);

    return { items, total, page, pageSize };
  }

  /** A single lead with its campaign name. */
  async findOne(sessionId: string, id: string): Promise<LeadWithCampaign> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    const [lead] = await this.leadModel.aggregate<LeadWithCampaign>([
      { $match: { _id: new Types.ObjectId(id), sessionId } },
      {
        $lookup: {
          from: 'campaigns',
          localField: 'campaignId',
          foreignField: '_id',
          as: 'campaign',
        },
      },
      {
        $addFields: {
          campaignName: {
            $ifNull: [{ $arrayElemAt: ['$campaign.name', 0] }, null],
          },
        },
      },
      { $project: { campaign: 0, __v: 0 } },
    ]);
    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return lead;
  }
}
