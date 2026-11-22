import { IsOptional, IsString, Matches } from 'class-validator';

export class ListConnectionsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/)
  provider?: string;

  /** Only accounts of the provider this app uses (see `authorizedApps` for readiness). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/)
  app?: string;
}
