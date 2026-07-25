import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LlmAccount,
  LlmAccountDocument,
  LlmProvider,
} from './llm-account.schema';
import { CreateLlmAccountDto } from './dto/create-llm-account.dto';
import { UpdateLlmAccountDto } from './dto/update-llm-account.dto';

/** Full LLM config (incl. key) sent to the ADK writer sidecar. */
export interface ResolvedLlmConfig {
  id: string;
  provider: LlmProvider;
  model: string;
  apiKey: string;
  apiBase: string;
  temperature: number;
}

const TEST_TIMEOUT_MS = 30_000;

@Injectable()
export class LlmAccountsService {
  private readonly logger = new Logger(LlmAccountsService.name);
  private readonly aiWriterUrl: string;

  constructor(
    @InjectModel(LlmAccount.name)
    private readonly model: Model<LlmAccountDocument>,
    config: ConfigService,
  ) {
    this.aiWriterUrl = (
      config.get<string>('app.aiWriterUrl') ?? 'http://localhost:8000'
    ).replace(/\/$/, '');
  }

  async list(sessionId: string): Promise<Record<string, unknown>[]> {
    const docs = await this.model
      .find({ sessionId })
      .sort({ isDefault: -1, createdAt: 1 })
      .exec();
    return docs.map((d) => this.toPublic(d));
  }

  async hasAny(sessionId: string): Promise<boolean> {
    return (await this.model.countDocuments({ sessionId }).exec()) > 0;
  }

  async create(
    sessionId: string,
    dto: CreateLlmAccountDto,
  ): Promise<Record<string, unknown>> {
    const existing = await this.model.countDocuments({ sessionId }).exec();
    const makeDefault = existing === 0 || dto.isDefault === true;

    if (makeDefault && existing > 0) {
      await this.model
        .updateMany({ sessionId }, { $set: { isDefault: false } })
        .exec();
    }

    const doc = await this.model.create({
      sessionId,
      label: dto.label.trim(),
      provider: dto.provider,
      model: dto.model.trim(),
      apiKey: dto.apiKey ?? '',
      apiBase: dto.apiBase?.trim() ?? '',
      temperature: dto.temperature ?? 0.7,
      isDefault: makeDefault,
    });
    this.logger.log(
      `Session ${sessionId}: added LLM "${doc.label}" (${doc.provider})${
        doc.isDefault ? ' (default)' : ''
      }.`,
    );
    return this.toPublic(doc);
  }

  async update(
    sessionId: string,
    id: string,
    dto: UpdateLlmAccountDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.findOwned(sessionId, id);

    if (dto.label !== undefined) doc.label = dto.label.trim();
    if (dto.provider !== undefined) doc.provider = dto.provider;
    // `model` collides with Document.model in Mongoose's types — use set().
    if (dto.model !== undefined) doc.set('model', dto.model.trim());
    if (dto.apiBase !== undefined) doc.apiBase = dto.apiBase.trim();
    if (dto.temperature !== undefined) doc.temperature = dto.temperature;
    // Blank key means "keep the stored one".
    if (dto.apiKey) doc.apiKey = dto.apiKey;

    if (dto.isDefault === true && !doc.isDefault) {
      await this.model
        .updateMany({ sessionId }, { $set: { isDefault: false } })
        .exec();
      doc.isDefault = true;
    }

    await doc.save();
    return this.toPublic(doc);
  }

  async setDefault(
    sessionId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.findOwned(sessionId, id);
    await this.model
      .updateMany({ sessionId }, { $set: { isDefault: false } })
      .exec();
    doc.isDefault = true;
    await doc.save();
    this.logger.log(`Session ${sessionId}: default LLM → "${doc.label}".`);
    return this.toPublic(doc);
  }

  async remove(sessionId: string, id: string): Promise<{ deleted: boolean }> {
    const doc = await this.findOwned(sessionId, id);
    const wasDefault = doc.isDefault;
    await this.model.deleteOne({ _id: doc._id }).exec();

    if (wasDefault) {
      const next = await this.model
        .findOne({ sessionId })
        .sort({ createdAt: 1 })
        .exec();
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    this.logger.log(`Session ${sessionId}: removed LLM "${doc.label}".`);
    return { deleted: true };
  }

  /**
   * The default account's full config for writing. Returns null when the
   * session has no LLM configured — the writer then falls back to its built-in
   * local writer.
   */
  async getDefaultConfig(sessionId: string): Promise<ResolvedLlmConfig | null> {
    const doc =
      (await this.model.findOne({ sessionId, isDefault: true }).exec()) ??
      (await this.model.findOne({ sessionId }).sort({ createdAt: 1 }).exec());
    return doc ? this.toResolved(doc) : null;
  }

  /** Ask the ADK sidecar to try a tiny generation with this account's config. */
  async test(
    sessionId: string,
    id: string,
  ): Promise<{ success: boolean; error?: string; engine?: string }> {
    const cfg = this.toResolved(await this.findOwned(sessionId, id));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.aiWriterUrl}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm: this.toWirePayload(cfg) }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        engine?: string;
      };
      if (!res.ok) {
        return { success: false, error: data.error ?? `Writer responded ${res.status}` };
      }
      return {
        success: !!data.success,
        error: data.error,
        engine: data.engine,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not reach the AI writer';
      return { success: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  /** The `llm` payload shape the sidecar expects. */
  toWirePayload(cfg: ResolvedLlmConfig): Record<string, unknown> {
    return {
      provider: cfg.provider,
      model: cfg.model,
      apiKey: cfg.apiKey,
      apiBase: cfg.apiBase,
      temperature: cfg.temperature,
    };
  }

  private toResolved(doc: LlmAccountDocument): ResolvedLlmConfig {
    const o = doc.toObject() as LlmAccount & { _id: Types.ObjectId };
    return {
      id: doc._id.toString(),
      provider: o.provider,
      model: o.model,
      apiKey: o.apiKey,
      apiBase: o.apiBase,
      temperature: o.temperature,
    };
  }

  private async findOwned(
    sessionId: string,
    id: string,
  ): Promise<LlmAccountDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('LLM account not found');
    }
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), sessionId })
      .exec();
    if (!doc) throw new NotFoundException('LLM account not found');
    return doc;
  }

  private toPublic(doc: LlmAccountDocument): Record<string, unknown> {
    const o = doc.toObject() as LlmAccount & { _id: Types.ObjectId };
    const { apiKey, ...rest } = o;
    return {
      ...rest,
      _id: doc._id.toString(),
      hasApiKey: !!apiKey,
      apiKeyMasked: apiKey ? `••••••${apiKey.slice(-4)}` : '',
    };
  }
}
