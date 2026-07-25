import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LLM_PROVIDERS, LlmProvider } from '../llm-account.schema';

/**
 * All fields optional on update. A blank/omitted `apiKey` keeps the stored one
 * (so the masked value shown in the form is never written back).
 */
export class UpdateLlmAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsIn(LLM_PROVIDERS)
  provider?: LlmProvider;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiBase?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
