import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSettings, AiSettingsSchema } from './ai-settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EmailWriterModule } from '../email-writer/email-writer.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiSettings.name, schema: AiSettingsSchema },
    ]),
    EmailWriterModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
