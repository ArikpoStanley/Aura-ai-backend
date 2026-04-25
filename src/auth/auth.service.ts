import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import {
  JWT_TYP_ACCESS,
  JWT_TYP_PASSWORD_RESET,
  JWT_TYP_SIGNUP_SETUP,
} from './auth.constants';
import { CompleteResetPasswordDto } from './dto/complete-reset.dto';
import { CompleteSignupDto } from './dto/complete-signup.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordRequestDto } from './dto/reset-request.dto';
import { ResetVerifyOtpDto } from './dto/reset-verify-otp.dto';
import { SignupRequestOtpDto } from './dto/signup-request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UsersService } from '../users/users.service';
import type { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get otpTtlMs(): number {
    const minutes = Number(
      this.config.get<string>('OTP_EXPIRES_MINUTES', '10'),
    );
    return (Number.isFinite(minutes) ? minutes : 10) * 60 * 1000;
  }

  private generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private signAccessToken(user: UserDocument): string {
    return this.jwtService.sign({
      sub: user._id.toString(),
      typ: JWT_TYP_ACCESS,
      email: user.email ?? undefined,
      phoneNumber: user.phoneNumber ?? undefined,
    });
  }

  private authResponse(user: UserDocument) {
    return {
      access_token: this.signAccessToken(user),
      user: {
        id: user._id.toString(),
        email: user.email ?? null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        phoneNumber: user.phoneNumber ?? null,
        displayName: user.displayName ?? null,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Incorrect email/password!');
    }
    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Incorrect email/password!');
    }
    return this.authResponse(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersService.createWithEmailAndPassword(
      dto.email,
      dto.password,
      dto.firstName,
      dto.lastName,
    );
    return this.authResponse(user);
  }

  async signupRequestOtp(dto: SignupRequestOtpDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.otpTtlMs);
    await this.usersService.upsertOtp(email, 'signup', code, expiresAt);
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[DEV] Signup OTP for ${email}: ${code}`);
    }
    return { message: 'OTP sent' };
  }

  async signupVerifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const ok = await this.usersService.verifyOtpAndDelete(email, 'signup', dto.code);
    if (!ok) {
      throw new BadRequestException('Invalid OTP');
    }
    const setupToken = this.jwtService.sign(
      { typ: JWT_TYP_SIGNUP_SETUP, email },
      { expiresIn: '15m' },
    );
    return { setupToken };
  }

  async signupComplete(dto: CompleteSignupDto) {
    let payload: { typ?: string; email?: string };
    try {
      payload = this.jwtService.verify<{ typ?: string; email?: string }>(
        dto.setupToken,
      );
    } catch {
      throw new BadRequestException('Invalid or expired setup token');
    }
    if (payload.typ !== JWT_TYP_SIGNUP_SETUP || !payload.email) {
      throw new BadRequestException('Invalid or expired setup token');
    }
    const existing = await this.usersService.findByEmail(payload.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersService.createWithEmailAndPassword(
      payload.email,
      dto.password,
      dto.firstName,
      dto.lastName,
    );
    return this.authResponse(user);
  }

  async requestPasswordReset(dto: ResetPasswordRequestDto) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Email not registered');
    }
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.otpTtlMs);
    await this.usersService.upsertOtp(
      email,
      'reset_password',
      code,
      expiresAt,
    );
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[DEV] Password reset OTP for ${email}: ${code}`);
    }
    return { message: 'OTP sent' };
  }

  async resetVerifyOtp(dto: ResetVerifyOtpDto) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Email not registered');
    }
    const ok = await this.usersService.verifyOtpAndDelete(
      email,
      'reset_password',
      dto.code,
    );
    if (!ok) {
      throw new BadRequestException('Invalid OTP');
    }
    const resetToken = this.jwtService.sign(
      { typ: JWT_TYP_PASSWORD_RESET, sub: user._id.toString() },
      { expiresIn: '15m' },
    );
    return { resetToken };
  }

  async resetComplete(dto: CompleteResetPasswordDto) {
    let payload: { typ?: string; sub?: string };
    try {
      payload = this.jwtService.verify<{ typ?: string; sub?: string }>(
        dto.resetToken,
      );
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (payload.typ !== JWT_TYP_PASSWORD_RESET || !payload.sub) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    await this.usersService.updatePassword(payload.sub, dto.password);
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new BadRequestException('User no longer exists');
    }
    return this.authResponse(user);
  }

  async oauthLogin(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authResponse(user);
  }
}
