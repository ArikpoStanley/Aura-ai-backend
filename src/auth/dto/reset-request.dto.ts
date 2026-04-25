import { IsEmail } from 'class-validator';

export class ResetPasswordRequestDto {
  @IsEmail({}, { message: 'Valid email is required' })
  email: string;
}
