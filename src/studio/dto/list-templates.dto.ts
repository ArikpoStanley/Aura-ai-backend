import { IsOptional, IsString } from 'class-validator';

export class ListTemplatesDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
