import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class ResetVerifyOtpDto {
  @IsEmail({}, { message: 'Valid email is required' })
  email: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}
