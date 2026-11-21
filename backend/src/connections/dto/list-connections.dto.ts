import { IsIn, IsOptional } from 'class-validator';

export class ListConnectionsDto {
  @IsOptional()
  @IsIn(['gmail'])
  provider?: 'gmail';
}
