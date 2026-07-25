import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from './lead.schema';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

/**
 * Owns the Lead model and read-only lead views (list across campaigns + detail).
 * Leads are created by the `campaigns` module (upload) and updated by its worker.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [MongooseModule],
})
export class LeadsModule {}
