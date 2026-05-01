import { Equals, IsBoolean, IsJWT, IsString, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

export class CompleteSignupDto {
  @IsJWT()
  setupToken: string;

  @IsString()
  @MinLength(1, { message: 'First name is required' })
  firstName: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  lastName: string;

  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @MinLength(8)
  @Match('password', { message: 'Password not match! Check again' })
  confirmPassword: string;

  @IsBoolean({ message: 'termsAccepted must be a boolean' })
  @Equals(true, { message: 'You must accept terms and conditions' })
  termsAccepted: boolean;
}
