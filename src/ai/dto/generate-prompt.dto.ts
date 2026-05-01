import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GeneratePromptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  idea: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetAudience?: string;
}
