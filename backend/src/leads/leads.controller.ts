import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { SessionId } from '../common/session-id.decorator';

/** Read-only views over all leads in a session (across campaigns). */
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /** All leads, each tagged with its campaign name. */
  @Get()
  async list(
    @SessionId() sessionId: string,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: string,
  ) {
    return this.leadsService.listAll(sessionId, { campaignId, status });
  }

  /** A single lead with campaign context. */
  @Get(':id')
  async getOne(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.leadsService.findOne(sessionId, id);
  }
}
