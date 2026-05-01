import { IsBoolean } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  videoGenerationComplete: boolean;

  @IsBoolean()
  weeklyReport: boolean;

  @IsBoolean()
  productUpdates: boolean;
}
