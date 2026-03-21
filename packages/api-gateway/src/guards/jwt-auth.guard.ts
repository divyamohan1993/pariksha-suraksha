import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';

/**
 * Global JWT authentication guard.
 * Validates the Bearer token on every request unless the endpoint is marked @Public().
 * Extracts the authenticated user and attaches it to request.user.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Check if the endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Delegate to passport-jwt strategy for token validation
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<T>(
    err: Error | null,
    user: T | false,
    info: Error | undefined,
  ): T {
    if (err) {
      throw err;
    }

    if (!user) {
      const message = info?.message || 'Authentication required';
      throw new UnauthorizedException(message);
    }

    return user;
  }
}
