import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAssetDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(['image', 'audio', 'video'])
  type: 'image' | 'audio' | 'video';

  @IsInt()
  @Min(1)
  @Max(500 * 1024 * 1024)
  sizeBytes: number;

  @IsUrl()
  url: string;
}
