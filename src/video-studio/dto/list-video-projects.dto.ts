import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum VideoProjectStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

export class ListVideoProjectsDto {
  @IsOptional()
  @IsEnum(VideoProjectStatus)
  status?: VideoProjectStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
