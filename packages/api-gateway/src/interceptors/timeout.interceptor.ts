import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { IS_LONG_RUNNING_KEY } from '../decorators';

/** Default timeout: 30 seconds for standard API calls. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Long-running timeout: 5 minutes for matrix generation, encryption, etc. */
const LONG_RUNNING_TIMEOUT_MS = 300_000;

/**
 * Timeout interceptor.
 * 30-second timeout for standard API calls.
 * 5-minute timeout for long-running operations (marked with @LongRunning()).
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isLongRunning = this.reflector.getAllAndOverride<boolean>(
      IS_LONG_RUNNING_KEY,
      [context.getHandler(), context.getClass()],
    );

    const timeoutMs = isLongRunning
      ? LONG_RUNNING_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err: Error) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${timeoutMs}ms`,
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
