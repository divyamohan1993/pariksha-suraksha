import {
  Injectable,
  ExecutionContext,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { AuthenticatedUser } from '../dto';
import { Request } from 'express';

/**
 * Rate limiting guard using token bucket algorithm via @nestjs/throttler.
 *
 * Default: 100 requests per minute per IP/user.
 * Unauthenticated verify endpoint: 10 requests per minute per IP.
 *
 * Uses user ID as the throttle key for authenticated requests,
 * falls back to IP for unauthenticated requests.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  /**
   * Generate a unique tracking key for rate limiting.
   * Authenticated users: keyed by user ID (prevents IP-based evasion).
   * Unauthenticated users: keyed by IP address.
   */
  protected async getTracker(req: Request): Promise<string> {
    const user = req.user as AuthenticatedUser | undefined;

    if (user?.userId) {
      return `user:${user.userId}`;
    }

    // Fall back to IP address for unauthenticated requests
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded) ||
      req.ip ||
      'unknown';

    return `ip:${ip}`;
  }
}
