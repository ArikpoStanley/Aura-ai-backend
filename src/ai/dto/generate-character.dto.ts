import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateCharacterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  style?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mood?: string;
}
