import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SessionId } from '../common/session-id.decorator';
import { AuditsService } from './audits.service';
import { Lead, LeadDocument, ACTIVE_LEAD_STATUSES } from '../leads/lead.schema';
import { PipelineService } from '../pipeline/pipeline.service';

/**
 * The Lead Audit API: read the full structured audit for a lead, or (re)run
 * the audit pipeline for a single lead without sending anything.
 */
@Controller('leads')
export class AuditsController {
  constructor(
    private readonly audits: AuditsService,
    private readonly pipeline: PipelineService,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
  ) {}

  /** The complete audit for a lead (research, rivals, analysis, email). */
  @Get(':id/audit')
  async get(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.audits.getForLead(sessionId, id);
  }

  /** Run (or re-run) the audit pipeline for one lead — no email is sent. */
  @Post(':id/audit')
  async run(@SessionId() sessionId: string, @Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Lead not found');
    }
    const lead = await this.leadModel
      .findOne({ _id: new Types.ObjectId(id), sessionId })
      .exec();
    if (!lead) throw new NotFoundException('Lead not found');
    if (ACTIVE_LEAD_STATUSES.includes(lead.status)) {
      throw new BadRequestException(
        'This lead is already being processed. Wait for it to finish.',
      );
    }
    const runId = await this.pipeline.startForLead(lead, { send: false });
    return { runId, leadId: id };
  }
}
