import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { SessionId } from '../common/session-id.decorator';

/** Read-only views over all leads in a session (across campaigns). */
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /** Paged leads, each tagged with its campaign name. */
  @Get()
  async list(
    @SessionId() sessionId: string,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.leadsService.listAll(sessionId, {
      campaignId,
      status,
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  /** A single lead with campaign context. */
  @Get(':id')
  async getOne(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.leadsService.findOne(sessionId, id);
  }
}
