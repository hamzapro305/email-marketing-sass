import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { SessionId } from '../common/session-id.decorator';
import { EmailComposeService } from '../ai/email-compose.service';
import { LlmAccountsService } from '../llm-accounts/llm-accounts.service';
import { LlmWirePayload } from '../ai/ai.types';

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
    private readonly emailCompose: EmailComposeService,
    private readonly llmAccounts: LlmAccountsService,
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
    @Body() body: { description?: string } = {},
  ) {
    const settings = await this.settingsService.getForSession(sessionId);
    const llmConfig = await this.llmAccounts.getDefaultConfig(sessionId);
    return this.emailCompose.compose({
      lead: SAMPLE_LEAD,
      campaign: {
        name: 'Sample campaign',
        description: body.description,
      },
      settings,
      audit: null,
      llm: llmConfig
        ? (this.llmAccounts.toWirePayload(llmConfig) as unknown as LlmWirePayload)
        : undefined,
    });
  }
}
