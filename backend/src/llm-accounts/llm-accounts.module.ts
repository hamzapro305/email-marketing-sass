import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmAccount, LlmAccountSchema } from './llm-account.schema';
import { LlmAccountsService } from './llm-accounts.service';
import { LlmAccountsController } from './llm-accounts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LlmAccount.name, schema: LlmAccountSchema },
    ]),
  ],
  controllers: [LlmAccountsController],
  providers: [LlmAccountsService],
  exports: [LlmAccountsService],
})
export class LlmAccountsModule {}
