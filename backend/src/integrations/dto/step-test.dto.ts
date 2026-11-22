import { IsMongoId, IsObject, IsOptional } from 'class-validator';

export class StepTestDto {
  @IsOptional()
  @IsMongoId()
  connectionId?: string;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
