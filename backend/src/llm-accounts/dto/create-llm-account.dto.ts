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

export class CreateLlmAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @IsIn(LLM_PROVIDERS)
  provider: LlmProvider;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model: string;

  /** Required for gemini/openai; ignored for ollama. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;

  /** Ollama base URL (e.g. http://localhost:11434). */
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
