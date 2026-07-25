import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiSettings, AiSettingsDocument } from './ai-settings.schema';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

/** Plain settings shape consumed by the email writer. */
export type AiSettingsData = Omit<AiSettings, never>;

const CACHE_TTL_MS = 15_000;

@Injectable()
export class SettingsService {
  private readonly cache = new Map<
    string,
    { value: AiSettingsData; expires: number }
  >();

  constructor(
    @InjectModel(AiSettings.name)
    private readonly model: Model<AiSettingsDocument>,
  ) {}

  /**
   * Resolve a session's settings (creating a default record on first access).
   * Cached briefly so a running campaign doesn't re-read Mongo for every lead.
   */
  async getForSession(sessionId: string): Promise<AiSettingsData> {
    const cached = this.cache.get(sessionId);
    if (cached && cached.expires > Date.now()) return cached.value;

    let doc = await this.model.findOne({ sessionId }).exec();
    if (!doc) {
      doc = await this.model.create({ sessionId });
    }
    const value = doc.toObject() as AiSettingsData;
    this.cache.set(sessionId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Settings for the API — API key masked, never returned in full. */
  async getPublic(sessionId: string): Promise<Record<string, unknown>> {
    const s = await this.getForSession(sessionId);
    return this.toPublic(s);
  }

  /** Upsert settings; blank `apiKey` keeps the stored one. */
  async update(
    sessionId: string,
    dto: UpdateAiSettingsDto,
  ): Promise<Record<string, unknown>> {
    const update: Record<string, unknown> = { ...dto };
    if (!dto.apiKey) delete update.apiKey; // don't overwrite with the masked value

    const doc = await this.model
      .findOneAndUpdate(
        { sessionId },
        { $set: { ...update, sessionId } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    this.cache.delete(sessionId);
    return this.toPublic(doc.toObject() as AiSettingsData);
  }

  private toPublic(s: AiSettingsData): Record<string, unknown> {
    const { apiKey, ...rest } = s as AiSettingsData & { apiKey: string };
    return {
      ...rest,
      hasApiKey: !!apiKey,
      apiKeyMasked: apiKey ? `••••••${apiKey.slice(-4)}` : '',
    };
  }
}
