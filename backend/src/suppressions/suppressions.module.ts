import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Suppression, SuppressionSchema } from './suppression.schema';
import { SuppressionsService } from './suppressions.service';
import { SuppressionsController } from './suppressions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Suppression.name, schema: SuppressionSchema },
    ]),
  ],
  controllers: [SuppressionsController],
  providers: [SuppressionsService],
  exports: [SuppressionsService],
})
export class SuppressionsModule {}
