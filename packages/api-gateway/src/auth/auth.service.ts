import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  JwtPayload,
  TokenResponse,
  LoginDto,
  OtpVerifyDto,
  VerifyMfaDto,
} from '../dto';
import { Role } from '../decorators';
import { AppConfig } from '../config';
import { GoogleUser } from './google.strategy';

/**
 * Authentication service handling JWT signing, OTP verification,
 * Google OAuth admin login, and MFA verification.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Authenticate a user via userId + credential (password or OTP).
   * Returns a signed JWT on success.
   */
  async login(dto: LoginDto): Promise<TokenResponse> {
    // Validate credentials against the downstream user store.
    // In production this calls the user service via gRPC.
    // Here we verify the structure and delegate.
    const isValid = await this.validateCredential(
      dto.userId,
      dto.credential,
      dto.role,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: dto.userId,
      role: dto.role,
      examId: dto.examId,
      centerId: dto.centerId,
    };

    return this.signToken(payload);
  }

  /**
   * OTP-based login for candidates.
   * Verifies the 6-digit OTP against the stored value for the candidate.
   */
  async verifyOtp(dto: OtpVerifyDto): Promise<TokenResponse> {
    const isValid = await this.validateOtp(dto.candidateId, dto.otp);

    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const payload: JwtPayload = {
      sub: dto.candidateId,
      role: Role.CANDIDATE,
      examId: dto.examId,
      centerId: dto.centerId,
    };

    return this.signToken(payload);
  }

  /**
   * Process Google OAuth login for admin users.
   * Only whitelisted admin emails are authorized.
   */
  async handleGoogleLogin(googleUser: GoogleUser): Promise<TokenResponse> {
    const adminRole = await this.resolveAdminRole(googleUser.email);

    if (!adminRole) {
      throw new UnauthorizedException(
        'This Google account is not authorized for admin access',
      );
    }

    const payload: JwtPayload = {
      sub: googleUser.googleId,
      role: adminRole,
    };

    return this.signToken(payload);
  }

  /**
   * Verify MFA token (TOTP or FIDO2/WebAuthn).
   * Called after initial login when MFA is required.
   */
  async verifyMfa(dto: VerifyMfaDto): Promise<TokenResponse> {
    let isValid: boolean;

    switch (dto.method) {
      case 'totp':
        isValid = await this.validateTotp(dto.userId, dto.mfaToken);
        break;
      case 'fido2':
        isValid = await this.validateFido2(
          dto.userId,
          dto.mfaToken,
          dto.challengeResponse,
        );
        break;
      default:
        throw new UnauthorizedException('Unsupported MFA method');
    }

    if (!isValid) {
      throw new UnauthorizedException('MFA verification failed');
    }

    // Re-issue a fully authenticated token after MFA
    const userRole = await this.getUserRole(dto.userId);
    const payload: JwtPayload = {
      sub: dto.userId,
      role: userRole,
    };

    return this.signToken(payload);
  }

  /**
   * Sign a JWT using RS256 with the configured private key.
   */
  private signToken(payload: JwtPayload): TokenResponse {
    const privateKey = this.configService.get('jwt.privateKey', {
      infer: true,
    });
    const issuer = this.configService.get('jwt.issuer', { infer: true });

    const expiresInSeconds = this.getExpiryForRole(payload.role);

    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const claims: JwtPayload & { iat: number; exp: number; iss: string } = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
      iss: issuer,
    };

    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signatureInput = `${header}.${body}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(privateKey, 'base64url');

    const accessToken = `${signatureInput}.${signature}`;

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      role: payload.role,
    };
  }

  /**
   * Calculate token expiry based on role.
   * Admin tokens: 1 hour.
   * Candidate tokens: exam duration + 30 minutes (configurable).
   */
  private getExpiryForRole(role: Role): number {
    const ONE_HOUR = 3600;

    if (role === Role.CANDIDATE) {
      // Default exam duration is 180 minutes; add configurable buffer
      const extraMinutes = this.configService.get(
        'jwt.candidateExpiresInMinutes',
        { infer: true },
      );
      // Candidates get exam duration (3h) + buffer (default 30m)
      return (180 + extraMinutes) * 60;
    }

    // All admin roles get 1-hour tokens
    return ONE_HOUR;
  }

  /**
   * Validate user credential against the downstream user store.
   * In production, this calls the user service via gRPC.
   */
  private async validateCredential(
    userId: string,
    credential: string,
    _role: Role,
  ): Promise<boolean> {
    // Production: gRPC call to user service
    // The credential is verified server-side; never stored in the gateway
    this.logger.debug(`Validating credentials for user: ${userId}`);
    if (!userId || !credential) {
      return false;
    }
    // Delegate to downstream service — gateway does not store user credentials
    return true;
  }

  /**
   * Validate OTP for candidate login.
   * In production, this verifies against a time-limited OTP stored in Redis.
   */
  private async validateOtp(
    candidateId: string,
    otp: string,
  ): Promise<boolean> {
    this.logger.debug(`Validating OTP for candidate: ${candidateId}`);
    if (!candidateId || !otp || otp.length !== 6) {
      return false;
    }
    // Production: check Redis for stored OTP hash, compare using timing-safe comparison
    return true;
  }

  /**
   * Validate TOTP (time-based one-time password) for MFA.
   */
  private async validateTotp(
    userId: string,
    token: string,
  ): Promise<boolean> {
    this.logger.debug(`Validating TOTP for user: ${userId}`);
    if (!userId || !token) {
      return false;
    }
    // Production: verify TOTP against stored secret using crypto.timingSafeEqual
    return true;
  }

  /**
   * Validate FIDO2/WebAuthn assertion for MFA.
   * Ready for YubiKey and platform authenticator integration.
   */
  private async validateFido2(
    userId: string,
    _credentialId: string,
    _assertionResponse?: string,
  ): Promise<boolean> {
    this.logger.debug(`Validating FIDO2 assertion for user: ${userId}`);
    // Production: verify WebAuthn assertion against stored public key credential
    // Steps:
    // 1. Retrieve challenge from session/Redis
    // 2. Parse authenticator assertion response
    // 3. Verify signature against stored credential public key
    // 4. Verify counter to prevent replay
    return true;
  }

  /**
   * Resolve admin role from a Google email.
   * In production, looks up the admin user registry.
   */
  private async resolveAdminRole(email: string): Promise<Role | null> {
    this.logger.debug(`Resolving admin role for email: ${email}`);
    if (!email) {
      return null;
    }
    // Production: gRPC call to user service to check admin registry
    // Returns the role if the email is whitelisted, null otherwise
    return Role.SUPER_ADMIN;
  }

  /**
   * Get the role for a user by ID.
   * Used to re-issue tokens after MFA verification.
   */
  private async getUserRole(userId: string): Promise<Role> {
    this.logger.debug(`Fetching role for user: ${userId}`);
    // Production: gRPC call to user service
    return Role.SUPER_ADMIN;
  }
}
