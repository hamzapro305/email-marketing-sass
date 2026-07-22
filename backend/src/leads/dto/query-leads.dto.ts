import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { LeadStatus } from '../lead.schema';

export class QueryLeadsDto {
  @IsOptional()
  @IsMongoId()
  campaignId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
