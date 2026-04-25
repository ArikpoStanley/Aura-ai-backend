import { IsEmail } from 'class-validator';

export class SignupRequestOtpDto {
  @IsEmail({}, { message: 'Valid email is required' })
  email: string;
}
