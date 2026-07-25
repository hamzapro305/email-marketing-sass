import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmtpAccount, SmtpAccountSchema } from './smtp-account.schema';
import { SmtpAccountsService } from './smtp-accounts.service';
import { SmtpAccountsController } from './smtp-accounts.controller';
import { EmailAgentModule } from '../email-agent/email-agent.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmtpAccount.name, schema: SmtpAccountSchema },
    ]),
    EmailAgentModule,
  ],
  controllers: [SmtpAccountsController],
  providers: [SmtpAccountsService],
  exports: [SmtpAccountsService],
})
export class SmtpAccountsModule {}
