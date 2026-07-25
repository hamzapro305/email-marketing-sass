import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { LlmAccountsService } from './llm-accounts.service';
import { LLM_PROVIDERS } from './llm-account.schema';
import { CreateLlmAccountDto } from './dto/create-llm-account.dto';
import { UpdateLlmAccountDto } from './dto/update-llm-account.dto';
import { SessionId } from '../common/session-id.decorator';

@Controller('llm-accounts')
export class LlmAccountsController {
  constructor(private readonly accounts: LlmAccountsService) {}

  /** Supported providers (for the UI's provider picker). */
  @Get('providers')
  providers() {
    return LLM_PROVIDERS;
  }

  /** List the session's LLM accounts (API keys masked). */
  @Get()
  list(@SessionId() sessionId: string) {
    return this.accounts.list(sessionId);
  }

  /** Add a new LLM. The first one becomes the default automatically. */
  @Post()
  create(@SessionId() sessionId: string, @Body() dto: CreateLlmAccountDto) {
    return this.accounts.create(sessionId, dto);
  }

  /** Update an LLM (blank API key keeps the stored one). */
  @Put(':id')
  update(
    @SessionId() sessionId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLlmAccountDto,
  ) {
    return this.accounts.update(sessionId, id, dto);
  }

  /** Make this LLM the default writer. */
  @Post(':id/default')
  setDefault(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.accounts.setDefault(sessionId, id);
  }

  /** Test the LLM by asking the writer sidecar for a tiny generation. */
  @Post(':id/test')
  test(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.accounts.test(sessionId, id);
  }

  /** Delete an LLM (promotes another to default if needed). */
  @Delete(':id')
  remove(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.accounts.remove(sessionId, id);
  }
}
