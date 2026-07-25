import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  /** Only applied when non-empty (so the masked value on the form is ignored). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderCompany?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderRole?: string;

  @IsOptional()
  @IsIn(['professional', 'friendly', 'casual', 'concise', 'persuasive'])
  tone?: 'professional' | 'friendly' | 'casual' | 'concise' | 'persuasive';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  wordLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  callToAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;
}
