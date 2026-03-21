import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedUser } from '../dto';

/**
 * Structured JSON logging interceptor.
 * Logs every request with: request ID, HTTP method, path, user ID, duration, status code.
 *
 * In production, structured logs are ingested by Google Cloud Logging
 * via @google-cloud/logging for centralized observability.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Ensure every request has a unique ID for tracing
    const requestId =
      (request.headers['x-request-id'] as string) || uuidv4();
    response.setHeader('X-Request-ID', requestId);

    const user = request.user as AuthenticatedUser | undefined;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (): void => {
          const duration = Date.now() - startTime;
          this.logRequest(
            request,
            response.statusCode,
            duration,
            requestId,
            user,
          );
        },
        error: (err: Error & { status?: number }): void => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || 500;
          this.logRequest(
            request,
            statusCode,
            duration,
            requestId,
            user,
            err.message,
          );
        },
      }),
    );
  }

  /**
   * Emit a structured log entry.
   * Format is compatible with Google Cloud Logging's structured payload.
   */
  private logRequest(
    request: Request,
    statusCode: number,
    durationMs: number,
    requestId: string,
    user: AuthenticatedUser | undefined,
    errorMessage?: string,
  ): void {
    const logEntry = {
      severity: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARNING' : 'INFO',
      httpRequest: {
        requestMethod: request.method,
        requestUrl: request.originalUrl,
        status: statusCode,
        latency: `${durationMs / 1000}s`,
        remoteIp: request.ip,
        userAgent: request.headers['user-agent'],
        protocol: request.protocol,
      },
      requestId,
      userId: user?.userId || 'anonymous',
      userRole: user?.role || 'unauthenticated',
      durationMs,
      ...(errorMessage && { errorMessage }),
    };

    if (statusCode >= 500) {
      this.logger.error(JSON.stringify(logEntry));
    } else if (statusCode >= 400) {
      this.logger.warn(JSON.stringify(logEntry));
    } else {
      this.logger.log(JSON.stringify(logEntry));
    }
  }
}
