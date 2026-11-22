import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GmailCallbackDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  authuser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  iss?: string;
}
