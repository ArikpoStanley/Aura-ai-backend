import { IsEnum, IsString, MinLength } from 'class-validator';

export class UpdateGeneralSettingsDto {
  @IsString()
  @MinLength(2)
  language: string;

  @IsString()
  @MinLength(2)
  timezone: string;

  @IsEnum(['light', 'dark', 'system'])
  themePreference: 'light' | 'dark' | 'system';
}
