import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, OtpVerifyDto, VerifyMfaDto, TokenResponse } from '../dto';
import { Public } from '../decorators';
import { GoogleUser } from './google.strategy';

/**
 * Authentication controller.
 * All endpoints here are public (no JWT required) as they issue JWTs.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Authenticates via userId + credential (password for admin, OTP for candidate).
   * Returns a signed JWT.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/verify-otp
   * OTP-based candidate login. Candidates receive a 6-digit OTP via SMS/email.
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: OtpVerifyDto): Promise<TokenResponse> {
    return this.authService.verifyOtp(dto);
  }

  /**
   * POST /auth/verify-mfa
   * Second-factor verification (TOTP or FIDO2/YubiKey).
   * Called after initial login when MFA is required.
   */
  @Public()
  @Post('verify-mfa')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Body() dto: VerifyMfaDto): Promise<TokenResponse> {
    return this.authService.verifyMfa(dto);
  }

  /**
   * GET /auth/google
   * Initiates Google OAuth 2.0 flow for admin login.
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // Guard redirects to Google — this method body is never reached
  }

  /**
   * GET /auth/google/callback
   * Handles the Google OAuth callback. Issues a JWT for authorized admin users.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request): Promise<TokenResponse> {
    const googleUser = req.user as GoogleUser;
    return this.authService.handleGoogleLogin(googleUser);
  }
}
