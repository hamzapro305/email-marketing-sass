import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadAudit, LeadAuditSchema } from './lead-audit.schema';
import { CompanyProfile, CompanyProfileSchema } from './company-profile.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { AuditsService } from './audits.service';

/**
 * Owns the audit documents (per-lead structured audits) and the domain-level
 * company research cache. The pipeline module writes them; the API reads them.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeadAudit.name, schema: LeadAuditSchema },
      { name: CompanyProfile.name, schema: CompanyProfileSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  providers: [AuditsService],
  exports: [AuditsService, MongooseModule],
})
export class AuditsModule {}
