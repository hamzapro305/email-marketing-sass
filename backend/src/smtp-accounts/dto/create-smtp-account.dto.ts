import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSmtpAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  user: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pass: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  fromEmail?: string;

  /** Make this the default sender (the first account is always default). */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
