import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * A single already-parsed row. Used when the frontend parses the file locally
 * and POSTs a JSON array instead of uploading the raw file.
 */
export class ImportLeadRowDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class ImportLeadsJsonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportLeadRowDto)
  leads: ImportLeadRowDto[];
}
