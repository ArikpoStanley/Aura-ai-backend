import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class RemixVideoDto {
  @IsUrl()
  sourceVideoUrl: string;

  @IsString()
  @MaxLength(1500)
  instruction: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsObject()
  inputOverrides?: Record<string, unknown>;
}
