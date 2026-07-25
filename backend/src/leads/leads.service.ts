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
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  campaignId: Types.ObjectId | null;
  campaignName: string | null;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
  ) {}

  /** All leads for a session, newest activity first, each with its campaign name. */
  async listAll(
    sessionId: string,
    opts: { campaignId?: string; status?: string } = {},
  ): Promise<LeadWithCampaign[]> {
    const match: Record<string, unknown> = { sessionId };
    if (opts.campaignId && Types.ObjectId.isValid(opts.campaignId)) {
      match.campaignId = new Types.ObjectId(opts.campaignId);
    }
    if (opts.status) match.status = opts.status;

    return this.leadModel.aggregate<LeadWithCampaign>([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $limit: 5000 },
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
