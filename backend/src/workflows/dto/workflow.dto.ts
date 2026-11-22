import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsInt, IsMongoId, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class WorkflowStepDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/)
  id!: string;

  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/)
  app!: string;

  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/)
  operation!: string;

  @IsOptional()
  @IsMongoId()
  connectionId?: string;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ValidateNested()
  @Type(() => WorkflowStepDto)
  trigger!: WorkflowStepDto;

  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  pollIntervalSeconds?: number;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowStepDto)
  trigger?: WorkflowStepDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  pollIntervalSeconds?: number;
}

export class ListRunsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
