import { IsEnum, IsOptional } from 'class-validator';

export class ListAssetsDto {
  @IsOptional()
  @IsEnum(['image', 'audio', 'video'])
  type?: 'image' | 'audio' | 'video';
}
