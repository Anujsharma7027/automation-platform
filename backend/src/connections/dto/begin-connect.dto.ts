import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches } from 'class-validator';

export class BeginConnectDto {
  /** App keys to authorize; their scopes are requested together. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_-]{1,64}$/, { each: true })
  apps?: string[];
}
