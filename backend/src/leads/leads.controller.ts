import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadsService } from './leads.service';
import { ImportLeadsJsonDto } from './dto/import-leads.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { parseFile, ParsedLeadRow } from './lead-parser';

// Express.Multer.File is available through @types/multer.
type UploadedFileType = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Accepts EITHER a multipart file upload (field name `file`) OR a JSON body
   * `{ leads: [...] }` of already-parsed rows. Persists valid rows as pending.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: UploadedFileType | undefined,
    @Body() body: ImportLeadsJsonDto | Record<string, unknown>,
  ) {
    let rows: ParsedLeadRow[] = [];
    let skipped = 0;

    if (file?.buffer) {
      const result = parseFile(file.originalname, file.mimetype, file.buffer);
      rows = result.rows;
      skipped = result.skipped;
    } else if (Array.isArray((body as ImportLeadsJsonDto)?.leads)) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const raw of (body as ImportLeadsJsonDto).leads) {
        const email = (raw.email ?? '').toString().trim().toLowerCase();
        if (!emailRe.test(email)) {
          skipped += 1;
          continue;
        }
        rows.push({
          email,
          firstName: (raw.firstName ?? '').toString().trim(),
          lastName: (raw.lastName ?? '').toString().trim(),
          company: (raw.company ?? '').toString().trim(),
          title: (raw.title ?? '').toString().trim(),
        });
      }
    } else {
      throw new BadRequestException(
        'Provide a file upload (field "file") or a JSON body { leads: [...] }.',
      );
    }

    const summary = await this.leadsService.importRows(rows, skipped);
    return {
      imported: summary.imported,
      skipped: summary.skipped,
      leads: summary.leads,
    };
  }

  @Get()
  async list(@Query() query: QueryLeadsDto) {
    return this.leadsService.findAll(query);
  }

  @Delete()
  async clear() {
    return this.leadsService.clearAll();
  }
}
