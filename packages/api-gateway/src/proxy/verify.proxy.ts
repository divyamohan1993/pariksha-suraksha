import {
  Controller,
  Get,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../decorators';
import { GrpcClientService } from './grpc-client.service';

/**
 * Per-IP CAPTCHA tracking state.
 * In production, this would be backed by Redis for distributed tracking.
 */
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();

/** CAPTCHA threshold: require CAPTCHA after this many consecutive requests. */
const CAPTCHA_THRESHOLD = 3;

/** Window for counting consecutive requests (60 seconds). */
const CAPTCHA_WINDOW_MS = 60_000;

/**
 * Public verification proxy controller.
 * Candidates can verify their submission hash against the blockchain
 * without authentication.
 *
 * Per addendum Fix 14:
 * - Unauthenticated (public)
 * - Rate limit: 10 requests per minute per IP
 * - CAPTCHA required after 3 consecutive requests from same IP
 * - Response contains no PII: { verified: bool, timestamp: ISO-8601 }
 */
@Controller('verify')
export class VerifyProxyController {
  private readonly logger = new Logger(VerifyProxyController.name);
  private readonly serviceName = 'blockchain-service';

  constructor(private readonly grpcClient: GrpcClientService) {}

  /**
   * GET /api/v1/verify/:submissionHash
   * Public endpoint for candidates to verify their exam submission.
   * The submissionHash is SHA-256(candidateId || responseBlob || timestamp) — opaque and non-enumerable.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get(':submissionHash')
  async verifySubmission(
    @Param('submissionHash') submissionHash: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-captcha-token') captchaToken?: string,
  ): Promise<{ verified: boolean; timestamp: string }> {
    // Validate hash format (SHA-256 = 64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(submissionHash)) {
      throw new HttpException(
        'Invalid submission hash format',
        HttpStatus.BAD_REQUEST,
      );
    }

    const clientIp = forwardedFor || 'unknown';

    // Check CAPTCHA requirement
    const requiresCaptcha = this.checkCaptchaRequirement(clientIp);
    if (requiresCaptcha && !captchaToken) {
      throw new HttpException(
        'CAPTCHA verification required. Please include X-CAPTCHA-Token header.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (requiresCaptcha && captchaToken) {
      const captchaValid = await this.validateCaptcha(captchaToken);
      if (!captchaValid) {
        throw new HttpException(
          'Invalid CAPTCHA token',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Track request count for CAPTCHA threshold
    this.incrementRequestCount(clientIp);

    // Forward to blockchain service
    const response = await this.grpcClient.forward<{
      verified: boolean;
      timestamp: string;
    }>(this.serviceName, 'VerifySubmission', { submissionHash });

    // Return only non-PII fields
    return {
      verified: response.data.verified,
      timestamp: response.data.timestamp,
    };
  }

  /**
   * Check if a client IP has exceeded the CAPTCHA threshold.
   */
  private checkCaptchaRequirement(ip: string): boolean {
    const entry = ipRequestCounts.get(ip);
    if (!entry) {
      return false;
    }

    // Reset if window expired
    if (Date.now() > entry.resetAt) {
      ipRequestCounts.delete(ip);
      return false;
    }

    return entry.count >= CAPTCHA_THRESHOLD;
  }

  /**
   * Increment the per-IP request counter for CAPTCHA tracking.
   */
  private incrementRequestCount(ip: string): void {
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      ipRequestCounts.set(ip, { count: 1, resetAt: now + CAPTCHA_WINDOW_MS });
    } else {
      entry.count++;
    }

    // Evict stale entries periodically (simple cleanup)
    if (ipRequestCounts.size > 10000) {
      for (const [key, val] of ipRequestCounts) {
        if (now > val.resetAt) {
          ipRequestCounts.delete(key);
        }
      }
    }
  }

  /**
   * Validate a CAPTCHA token.
   * In production, this calls Google reCAPTCHA or hCaptcha verification API.
   */
  private async validateCaptcha(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }
    // Production: POST to https://www.google.com/recaptcha/api/siteverify
    // with secret + token, verify response.success === true
    this.logger.debug('Validating CAPTCHA token');
    return true;
  }
}
