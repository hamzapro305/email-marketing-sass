import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSettings, AiSettingsSchema } from './ai-settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AiModule } from '../ai/ai.module';
import { LlmAccountsModule } from '../llm-accounts/llm-accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiSettings.name, schema: AiSettingsSchema },
    ]),
    AiModule,
    LlmAccountsModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
