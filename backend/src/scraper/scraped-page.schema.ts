import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ScrapedPageDocument = HydratedDocument<ScrapedPage>;

/**
 * Cache of one fetched public web page. Shared by every worker and every lead:
 * 500 leads from the same company scrape its site once, not 500 times. Entries
 * expire via the TTL index on `expiresAt`.
 */
@Schema({ timestamps: true, collection: 'scraped_pages' })
export class ScrapedPage {
  @Prop({ required: true, unique: true })
  url: string;

  @Prop({ required: true, index: true })
  domain: string;

  /** 'ok' — parsed content below is usable; 'error' — negative cache. */
  @Prop({ required: true, enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @Prop({ type: Number, default: null })
  httpStatus: number | null;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ default: '' })
  title: string;

  @Prop({ default: '' })
  description: string;

  /** Extracted visible text (capped — enough for analysis, not the whole DOM). */
  @Prop({ default: '' })
  text: string;

  @Prop({ type: Number, default: 0 })
  wordCount: number;

  /** Same-site links found on the page (path + anchor text), for discovery. */
  @Prop({ type: [{ href: String, text: String, _id: false }], default: [] })
  links: Array<{ href: string; text: string }>;

  /** Outbound social profile links. */
  @Prop({ type: [String], default: [] })
  socialLinks: string[];

  /** Detected platform/tooling hints (generator meta, script signatures). */
  @Prop({ type: [String], default: [] })
  techHints: string[];

  @Prop({ required: true })
  fetchedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;
}

export const ScrapedPageSchema = SchemaFactory.createForClass(ScrapedPage);
// Mongo evicts expired cache entries itself.
ScrapedPageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
