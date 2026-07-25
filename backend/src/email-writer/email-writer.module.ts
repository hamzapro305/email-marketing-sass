import { Module } from '@nestjs/common';
import { DemoEmailWriter } from './demo-email-writer';
import { EmailWriterService } from './email-writer.service';
import { LlmAccountsModule } from '../llm-accounts/llm-accounts.module';

@Module({
  imports: [LlmAccountsModule],
  providers: [DemoEmailWriter, EmailWriterService],
  exports: [EmailWriterService],
})
export class EmailWriterModule {}
