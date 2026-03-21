import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Standardized error response format.
 * Consistent across all endpoints for client-side error handling.
 */
interface ErrorResponse {
  statusCode: number;
  message: string;
  errorCode: string;
  timestamp: string;
  path: string;
}

/**
 * Global exception filter that catches all unhandled exceptions.
 * Returns a standardized error response and never exposes stack traces in production.
 *
 * Error codes follow the pattern: CATEGORY_SPECIFIC (e.g., AUTH_TOKEN_EXPIRED).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string;
    let errorCode: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        // Handle class-validator errors (array of messages)
        if (Array.isArray(responseObj.message)) {
          message = (responseObj.message as string[]).join('; ');
        } else {
          message = (responseObj.message as string) || exception.message;
        }
      } else {
        message = exception.message;
      }

      errorCode = this.mapHttpStatusToErrorCode(statusCode);
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = this.isProduction
        ? 'An unexpected error occurred'
        : exception.message;
      errorCode = 'INTERNAL_SERVER_ERROR';

      // Log full error details server-side for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      errorCode = 'INTERNAL_UNKNOWN_ERROR';

      this.logger.error(`Unknown exception type: ${String(exception)}`);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Log 5xx errors at error level, 4xx at warn level
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${statusCode}: ${message}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} ${statusCode}: ${message}`,
      );
    }

    response.status(statusCode).json(errorResponse);
  }

  /**
   * Map HTTP status codes to domain-specific error codes.
   */
  private mapHttpStatusToErrorCode(status: number): string {
    const statusMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.UNAUTHORIZED]: 'AUTH_UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'AUTH_FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
      [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_UNPROCESSABLE',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
      [HttpStatus.REQUEST_TIMEOUT]: 'REQUEST_TIMEOUT',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
      [HttpStatus.BAD_GATEWAY]: 'SERVICE_UNAVAILABLE',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      [HttpStatus.GATEWAY_TIMEOUT]: 'SERVICE_TIMEOUT',
    };

    return statusMap[status] || `HTTP_ERROR_${status}`;
  }
}
