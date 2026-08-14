import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CampaignsService, UploadedFileType } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { SessionId } from '../common/session-id.decorator';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /** Create a draft campaign (name + optional description/context for the AI). */
  @Post()
  async create(
    @SessionId() sessionId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(sessionId, dto);
  }

  /** List the session's campaigns. */
  @Get()
  async list(@SessionId() sessionId: string) {
    return this.campaignsService.list(sessionId);
  }

  /** Campaign detail (status + counters). */
  @Get(':id')
  async getOne(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.campaignsService.findOne(sessionId, id);
  }

  /** Delete a campaign and its leads/files. */
  @Delete(':id')
  async remove(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.campaignsService.remove(sessionId, id);
  }

  /** Upload a CSV/XLSX to add leads to this campaign. */
  @Post(':id/uploads')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @SessionId() sessionId: string,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileType | undefined,
  ) {
    const result = await this.campaignsService.uploadLeads(sessionId, id, file!);
    return {
      file: result.file,
      imported: result.imported,
      skipped: result.skipped,
      duplicates: result.duplicates,
    };
  }

  /** Files uploaded to this campaign. */
  @Get(':id/uploads')
  async files(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.campaignsService.listFiles(sessionId, id);
  }

  /** Delete a file (and its not-yet-sent leads) from the campaign. */
  @Delete(':id/uploads/:fileId')
  async deleteFile(
    @SessionId() sessionId: string,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.campaignsService.deleteFile(sessionId, id, fileId);
  }

  /** Leads belonging to this campaign (with live per-row status). */
  @Get(':id/leads')
  async leads(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.campaignsService.findLeads(sessionId, id);
  }

  /** Start (or re-run) the campaign — enqueues its pending leads. */
  @Post(':id/start')
  async start(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.campaignsService.start(sessionId, id);
  }
}
