import { IsEmail, IsString, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

/** Direct sign-up without OTP (useful for testing; production may prefer the signup OTP flow). */
export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  firstName: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  lastName: string;

  @IsEmail({}, { message: 'Valid email is required' })
  email: string;

  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @MinLength(8)
  @Match('password', { message: 'Password not match! Check again' })
  confirmPassword: string;
}
