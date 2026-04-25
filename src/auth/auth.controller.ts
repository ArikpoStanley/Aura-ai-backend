import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CompleteResetPasswordDto } from './dto/complete-reset.dto';
import { CompleteSignupDto } from './dto/complete-signup.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordRequestDto } from './dto/reset-request.dto';
import { ResetVerifyOtpDto } from './dto/reset-verify-otp.dto';
import { SignupRequestOtpDto } from './dto/signup-request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

type OAuthReq = Request & { user: { userId: string } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Direct registration (no SMS OTP). */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('signup/request-otp')
  signupRequestOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  @Post('signup/resend-otp')
  signupResendOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  @Post('signup/verify-otp')
  signupVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.signupVerifyOtp(dto);
  }

  @Post('email-verification/request-otp')
  emailVerificationRequestOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  @Post('email-verification/resend-otp')
  emailVerificationResendOtp(@Body() dto: SignupRequestOtpDto) {
    return this.authService.signupRequestOtp(dto);
  }

  @Post('email-verification/verify-otp')
  emailVerificationVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.signupVerifyOtp(dto);
  }

  @Post('signup/complete')
  signupComplete(@Body() dto: CompleteSignupDto) {
    return this.authService.signupComplete(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password/request')
  resetPasswordRequest(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password/resend-otp')
  resetPasswordResendOtp(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password/verify')
  resetPasswordVerify(@Body() dto: ResetVerifyOtpDto) {
    return this.authService.resetVerifyOtp(dto);
  }

  @Post('reset-password/complete')
  resetPasswordComplete(@Body() dto: CompleteResetPasswordDto) {
    return this.authService.resetComplete(dto);
  }

  @Post('forgot-password/verify')
  forgotPasswordVerify(@Body() dto: ResetVerifyOtpDto) {
    return this.authService.resetVerifyOtp(dto);
  }

  @Post('forgot-password/resend-otp')
  forgotPasswordResendOtp(@Body() dto: ResetPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('forgot-password/complete')
  forgotPasswordComplete(@Body() dto: CompleteResetPasswordDto) {
    return this.authService.resetComplete(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    /* redirects to Google */
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: OAuthReq) {
    return this.authService.oauthLogin(req.user.userId);
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  facebookAuth(): void {
    /* redirects to Facebook */
  }

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  facebookCallback(@Req() req: OAuthReq) {
    return this.authService.oauthLogin(req.user.userId);
  }
}
