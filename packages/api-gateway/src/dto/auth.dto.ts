import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  Length,
  Matches,
} from 'class-validator';
import { Role } from '../decorators';

/**
 * JWT token payload structure.
 * Contains the minimal claims needed for authorization decisions.
 */
export interface JwtPayload {
  /** Subject — user ID */
  sub: string;
  /** User role for RBAC */
  role: Role;
  /** Exam ID (present for candidates and invigilators) */
  examId?: string;
  /** Center ID (present for candidates and invigilators) */
  centerId?: string;
  /** Token issued-at timestamp */
  iat?: number;
  /** Token expiration timestamp */
  exp?: number;
  /** Issuer */
  iss?: string;
}

/**
 * Login request — supports OTP-based candidate login and admin credential login.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  credential!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  centerId?: string;
}

/**
 * OTP verification request for candidate login.
 */
export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp!: string;

  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsOptional()
  @IsString()
  centerId?: string;
}

/**
 * MFA verification request — supports TOTP and FIDO2/WebAuthn.
 */
export class VerifyMfaDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  mfaToken!: string;

  @IsEnum(['totp', 'fido2'] as const)
  method!: 'totp' | 'fido2';

  @IsOptional()
  @IsString()
  challengeResponse?: string;
}

/**
 * Google OAuth callback query parameters.
 */
export class GoogleOAuthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  state?: string;
}

/**
 * Token response returned after successful authentication.
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  role: Role;
}

/**
 * Authenticated user attached to request by JwtAuthGuard.
 */
export interface AuthenticatedUser {
  userId: string;
  role: Role;
  examId?: string;
  centerId?: string;
}
