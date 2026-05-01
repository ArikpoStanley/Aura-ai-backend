import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateImageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1500)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  style?: string;
}
