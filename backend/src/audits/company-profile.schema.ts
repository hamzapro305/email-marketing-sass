import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import {
  AuditAnalysis,
  CompanyProfileData,
  RivalData,
  ScrapedPageRef,
} from './audit.types';
import { WebsiteSignals } from '../scraper/scraper.types';

export type CompanyProfileDocument = HydratedDocument<CompanyProfile>;

/**
 * Domain-level research cache. Company research and rival discovery depend
 * only on the company (not the individual lead), so 500 leads at acme.com
 * produce ONE research pass. Entries expire via the TTL index on `expiresAt`.
 */
@Schema({ timestamps: true, collection: 'company_profiles' })
export class CompanyProfile {
  @Prop({ required: true, unique: true, lowercase: true })
  domain: string;

  @Prop({ default: '' })
  website: string;

  /** AI (or fallback) structured profile. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  profile: CompanyProfileData | null;

  /** Deterministic website signals. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  signals: WebsiteSignals | null;

  /** Pages scraped from the company site (refs incl. excerpts). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  pages: ScrapedPageRef[];

  /** Discovered rivals (incl. scraped evidence once the scrape stage ran). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  rivals: RivalData[] | null;

  /**
   * The audit analysis, cached per domain: it is company-scoped by design, so
   * every lead at this company reuses one analysis instead of paying for a
   * fresh model call each.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  analysis: AuditAnalysis | null;

  @Prop({ required: true })
  expiresAt: Date;
}

export const CompanyProfileSchema = SchemaFactory.createForClass(CompanyProfile);
CompanyProfileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
