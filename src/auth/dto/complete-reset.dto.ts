import { IsJWT, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

export class CompleteResetPasswordDto {
  @IsJWT()
  resetToken: string;

  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @MinLength(8)
  @Match('password', { message: 'Password not match! Check again' })
  confirmPassword: string;
}
