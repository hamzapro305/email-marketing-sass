import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { SessionId } from '../common/session-id.decorator';
import { EmailWriterService } from '../email-writer/email-writer.service';

/** Sample lead used for the Settings "preview" so users can test their config. */
const SAMPLE_LEAD = {
  email: 'jordan.lee@northwind.io',
  firstName: 'Jordan',
  lastName: 'Lee',
  company: 'Northwind',
  title: 'VP of Sales',
};

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly writer: EmailWriterService,
  ) {}

  /** Current AI settings (API key masked). */
  @Get('ai')
  async get(@SessionId() sessionId: string) {
    return this.settingsService.getPublic(sessionId);
  }

  /** Update AI settings. */
  @Put('ai')
  async update(
    @SessionId() sessionId: string,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    return this.settingsService.update(sessionId, dto);
  }

  /** Generate a sample email with the current settings (test the writer). */
  @Post('ai/preview')
  async preview(
    @SessionId() sessionId: string,
    @Body() body: { subject?: string; description?: string } = {},
  ) {
    const settings = await this.settingsService.getForSession(sessionId);
    return this.writer.compose({
      sessionId,
      lead: SAMPLE_LEAD,
      campaign: {
        name: 'Sample campaign',
        subject: body.subject,
        description: body.description,
      },
      settings,
    });
  }
}
