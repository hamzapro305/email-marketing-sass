import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(120)
  name: string;

  // Context the AI uses to personalize every email (what you're offering).
  // The subject and body themselves are AI-generated — not set here.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
