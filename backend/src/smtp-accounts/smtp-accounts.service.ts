import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmtpAccount, SmtpAccountDocument } from './smtp-account.schema';
import { CreateSmtpAccountDto } from './dto/create-smtp-account.dto';
import { UpdateSmtpAccountDto } from './dto/update-smtp-account.dto';

/** Full SMTP config (incl. password) used internally by the mail sender. */
export interface ResolvedSmtpConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

@Injectable()
export class SmtpAccountsService {
  private readonly logger = new Logger(SmtpAccountsService.name);

  constructor(
    @InjectModel(SmtpAccount.name)
    private readonly model: Model<SmtpAccountDocument>,
  ) {}

  /** Accounts for a session, default first, with passwords masked. */
  async list(sessionId: string): Promise<Record<string, unknown>[]> {
    const docs = await this.model
      .find({ sessionId })
      .sort({ isDefault: -1, createdAt: 1 })
      .exec();
    return docs.map((d) => this.toPublic(d));
  }

  /** Whether the session has at least one SMTP account configured. */
  async hasAny(sessionId: string): Promise<boolean> {
    return (await this.model.countDocuments({ sessionId }).exec()) > 0;
  }

  async create(
    sessionId: string,
    dto: CreateSmtpAccountDto,
  ): Promise<Record<string, unknown>> {
    const existing = await this.model.countDocuments({ sessionId }).exec();
    // The first account is always the default; otherwise honor the flag.
    const makeDefault = existing === 0 || dto.isDefault === true;

    if (makeDefault && existing > 0) {
      await this.model
        .updateMany({ sessionId }, { $set: { isDefault: false } })
        .exec();
    }

    const doc = await this.model.create({
      sessionId,
      label: dto.label.trim(),
      host: dto.host.trim(),
      port: dto.port,
      secure: dto.secure ?? false,
      user: dto.user.trim(),
      pass: dto.pass,
      fromName: dto.fromName?.trim() ?? '',
      fromEmail: dto.fromEmail?.trim() ?? '',
      isDefault: makeDefault,
    });
    this.logger.log(
      `Session ${sessionId}: added SMTP account "${doc.label}"${
        doc.isDefault ? ' (default)' : ''
      }.`,
    );
    return this.toPublic(doc);
  }

  async update(
    sessionId: string,
    id: string,
    dto: UpdateSmtpAccountDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.findOwned(sessionId, id);

    if (dto.label !== undefined) doc.label = dto.label.trim();
    if (dto.host !== undefined) doc.host = dto.host.trim();
    if (dto.port !== undefined) doc.port = dto.port;
    if (dto.secure !== undefined) doc.secure = dto.secure;
    if (dto.user !== undefined) doc.user = dto.user.trim();
    if (dto.fromName !== undefined) doc.fromName = dto.fromName.trim();
    if (dto.fromEmail !== undefined) doc.fromEmail = dto.fromEmail.trim();
    // Blank password means "keep the stored one".
    if (dto.pass) doc.pass = dto.pass;

    // Promoting to default demotes the others; you cannot un-default directly
    // (set another account as default instead).
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
    this.logger.log(`Session ${sessionId}: default SMTP → "${doc.label}".`);
    return this.toPublic(doc);
  }

  async remove(sessionId: string, id: string): Promise<{ deleted: boolean }> {
    const doc = await this.findOwned(sessionId, id);
    const wasDefault = doc.isDefault;
    await this.model.deleteOne({ _id: doc._id }).exec();

    // If we removed the default, promote the next oldest account.
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
    this.logger.log(`Session ${sessionId}: removed SMTP account "${doc.label}".`);
    return { deleted: true };
  }

  /**
   * The default account's full config for sending. Returns null when the
   * session has no accounts — callers must handle that (sending is gated on it).
   */
  async getDefaultConfig(sessionId: string): Promise<ResolvedSmtpConfig | null> {
    const doc =
      (await this.model.findOne({ sessionId, isDefault: true }).exec()) ??
      (await this.model.findOne({ sessionId }).sort({ createdAt: 1 }).exec());
    return doc ? this.toResolved(doc) : null;
  }

  /** Full config for one owned account (used by the "Test connection" action). */
  async getConfigById(
    sessionId: string,
    id: string,
  ): Promise<ResolvedSmtpConfig> {
    return this.toResolved(await this.findOwned(sessionId, id));
  }

  private toResolved(doc: SmtpAccountDocument): ResolvedSmtpConfig {
    const fromEmail = doc.fromEmail || doc.user;
    const from = doc.fromName ? `"${doc.fromName}" <${fromEmail}>` : fromEmail;
    return {
      id: doc._id.toString(),
      host: doc.host,
      port: doc.port,
      secure: doc.secure,
      user: doc.user,
      pass: doc.pass,
      from,
    };
  }

  private async findOwned(
    sessionId: string,
    id: string,
  ): Promise<SmtpAccountDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('SMTP account not found');
    }
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), sessionId })
      .exec();
    if (!doc) throw new NotFoundException('SMTP account not found');
    return doc;
  }

  private toPublic(doc: SmtpAccountDocument): Record<string, unknown> {
    const o = doc.toObject() as SmtpAccount & { _id: Types.ObjectId };
    const { pass, ...rest } = o;
    return {
      ...rest,
      _id: doc._id.toString(),
      hasPass: !!pass,
      passMasked: pass ? '••••••••' : '',
    };
  }

  /** Ensure a session can send — used to gate campaign starts. */
  async assertConfigured(sessionId: string): Promise<void> {
    if (!(await this.hasAny(sessionId))) {
      throw new BadRequestException(
        'No SMTP account configured. Add one in Settings before sending.',
      );
    }
  }
}
