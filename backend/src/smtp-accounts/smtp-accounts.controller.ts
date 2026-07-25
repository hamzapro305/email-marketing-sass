import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { SmtpAccountsService } from './smtp-accounts.service';
import { MailSenderService } from '../email-agent/mail-sender.service';
import { CreateSmtpAccountDto } from './dto/create-smtp-account.dto';
import { UpdateSmtpAccountDto } from './dto/update-smtp-account.dto';
import { SessionId } from '../common/session-id.decorator';

@Controller('smtp-accounts')
export class SmtpAccountsController {
  constructor(
    private readonly accounts: SmtpAccountsService,
    private readonly mailSender: MailSenderService,
  ) {}

  /** List the session's SMTP accounts (passwords masked). */
  @Get()
  list(@SessionId() sessionId: string) {
    return this.accounts.list(sessionId);
  }

  /** Add a new SMTP account. The first one becomes the default automatically. */
  @Post()
  create(
    @SessionId() sessionId: string,
    @Body() dto: CreateSmtpAccountDto,
  ) {
    return this.accounts.create(sessionId, dto);
  }

  /** Update an SMTP account (blank password keeps the stored one). */
  @Put(':id')
  update(
    @SessionId() sessionId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSmtpAccountDto,
  ) {
    return this.accounts.update(sessionId, id, dto);
  }

  /** Make this account the default sender. */
  @Post(':id/default')
  setDefault(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.accounts.setDefault(sessionId, id);
  }

  /** Verify credentials/connectivity for a saved account. */
  @Post(':id/test')
  async test(@SessionId() sessionId: string, @Param('id') id: string) {
    const config = await this.accounts.getConfigById(sessionId, id);
    return this.mailSender.verify(config);
  }

  /** Delete an SMTP account (promotes another to default if needed). */
  @Delete(':id')
  remove(@SessionId() sessionId: string, @Param('id') id: string) {
    return this.accounts.remove(sessionId, id);
  }
}
