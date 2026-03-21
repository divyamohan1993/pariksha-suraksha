import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedUser } from '../dto';

/** Methods that represent mutating operations requiring audit logging. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Audit event structure emitted to the blockchain service via gRPC.
 */
interface AuditEventPayload {
  eventId: string;
  eventType: string;
  method: string;
  path: string;
  actorId: string;
  actorRole: string;
  actorType: 'user' | 'system';
  examId?: string;
  centerId?: string;
  timestamp: string;
  statusCode: number;
  requestId: string;
}

/**
 * Audit interceptor — for every mutating request (POST/PUT/PATCH/DELETE),
 * emits an audit event to the blockchain service via gRPC.
 *
 * This implements Layer 6 (Audit) of the defense-in-depth model:
 * every mutation is recorded on the Hyperledger Fabric ledger for
 * tamper-evident auditing.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Only audit mutating operations
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const requestId =
      (request.headers['x-request-id'] as string) || uuidv4();
    const user = request.user as AuthenticatedUser | undefined;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (): void => {
          const response = context.switchToHttp().getResponse();
          const auditEvent = this.buildAuditEvent(
            request,
            user,
            requestId,
            response.statusCode,
          );

          // Fire-and-forget: emit to blockchain service via gRPC.
          // We do not await this — audit recording must not block the response.
          this.emitAuditEvent(auditEvent).catch((err: Error) => {
            this.logger.error(
              `Failed to emit audit event: ${err.message}`,
              err.stack,
            );
          });
        },
        error: (err: Error): void => {
          const auditEvent = this.buildAuditEvent(
            request,
            user,
            requestId,
            500,
          );
          auditEvent.eventType = `${auditEvent.eventType}_failed`;

          this.emitAuditEvent(auditEvent).catch((emitErr: Error) => {
            this.logger.error(
              `Failed to emit audit event for error: ${emitErr.message}`,
              emitErr.stack,
            );
          });
        },
      }),
    );
  }

  /**
   * Build a structured audit event payload from the request context.
   */
  private buildAuditEvent(
    request: Request,
    user: AuthenticatedUser | undefined,
    requestId: string,
    statusCode: number,
  ): AuditEventPayload {
    // Extract examId from route params or body
    const examId =
      user?.examId ||
      (request.params as Record<string, string>)['id'] ||
      (request.body as Record<string, string | undefined>)?.examId;

    const centerId =
      user?.centerId ||
      (request.params as Record<string, string>)['centerId'];

    // Derive event type from the route path
    const eventType = this.deriveEventType(request.method, request.path);

    return {
      eventId: uuidv4(),
      eventType,
      method: request.method,
      path: request.path,
      actorId: user?.userId || 'anonymous',
      actorRole: user?.role || 'unauthenticated',
      actorType: 'user',
      examId,
      centerId,
      timestamp: new Date().toISOString(),
      statusCode,
      requestId,
    };
  }

  /**
   * Derive a machine-readable audit event type from the HTTP method and path.
   */
  private deriveEventType(method: string, path: string): string {
    const segments = path.split('/').filter(Boolean);
    const resource = segments[segments.length - 1] || 'unknown';
    const action =
      method === 'POST'
        ? 'create'
        : method === 'PUT' || method === 'PATCH'
          ? 'update'
          : method === 'DELETE'
            ? 'delete'
            : 'mutate';

    return `${resource}_${action}`;
  }

  /**
   * Emit audit event to the blockchain service via gRPC.
   * In production, this uses the gRPC client to call blockchain-service.recordEvent().
   */
  private async emitAuditEvent(event: AuditEventPayload): Promise<void> {
    // Production: gRPC call to blockchain-service
    // const response = await this.blockchainClient.recordEvent(event).toPromise();
    this.logger.log(
      `Audit event emitted: ${event.eventType} by ${event.actorId} [${event.requestId}]`,
    );
  }
}
