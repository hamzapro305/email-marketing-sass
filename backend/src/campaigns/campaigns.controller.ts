import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /** Create a campaign from current pending leads and start the run. */
  @Post()
  async create(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.createAndStart(dto);
  }

  /** Campaign status + counters (polled by the frontend). */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  /** Leads for a campaign with live per-row status. */
  @Get(':id/leads')
  async getLeads(@Param('id') id: string) {
    return this.campaignsService.findLeads(id);
  }
}
