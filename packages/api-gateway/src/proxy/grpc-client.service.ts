import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { AppConfig } from '../config';

/**
 * Generic gRPC response wrapper.
 */
export interface GrpcResponse<T = Record<string, unknown>> {
  data: T;
  metadata?: Record<string, string>;
}

/**
 * Centralized gRPC client manager.
 * Creates and maintains gRPC channels to all downstream services.
 * Handles connection lifecycle, health checks, and error mapping.
 */
@Injectable()
export class GrpcClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrpcClientService.name);
  private readonly channels = new Map<string, grpc.Channel>();
  private readonly clients = new Map<string, grpc.Client>();

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing gRPC client connections');
    // Channels are created lazily on first use
  }

  onModuleDestroy(): void {
    this.logger.log('Closing gRPC client connections');
    for (const [name, channel] of this.channels) {
      channel.close();
      this.logger.log(`Closed gRPC channel: ${name}`);
    }
    this.channels.clear();
    this.clients.clear();
  }

  /**
   * Make a unary gRPC call to a downstream service.
   *
   * @param serviceName - Logical service name (e.g., 'question-service')
   * @param methodName - gRPC method name (e.g., 'ListQuestions')
   * @param payload - Request payload
   * @returns The response from the downstream service
   */
  async callUnary<TReq, TRes>(
    serviceName: string,
    methodName: string,
    payload: TReq,
  ): Promise<TRes> {
    const serviceUrl = this.getServiceUrl(serviceName);

    return new Promise<TRes>((resolve, reject) => {
      const channel = this.getOrCreateChannel(serviceName, serviceUrl);
      const client = new grpc.Client(
        serviceUrl,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 10000,
        },
      );

      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 30);

      client.makeUnaryRequest(
        `/${serviceName}/${methodName}`,
        (arg: TReq) => Buffer.from(JSON.stringify(arg)),
        (buf: Buffer) => JSON.parse(buf.toString()) as TRes,
        payload,
        new grpc.Metadata(),
        { deadline },
        (error: grpc.ServiceError | null, response?: TRes) => {
          if (error) {
            this.logger.error(
              `gRPC call failed: ${serviceName}/${methodName} — ${error.message}`,
            );
            reject(this.mapGrpcError(error, serviceName));
            return;
          }
          resolve(response!);
        },
      );
    });
  }

  /**
   * Forward an HTTP request to a downstream gRPC service.
   * This is the primary method used by proxy controllers.
   */
  async forward<TRes = Record<string, unknown>>(
    serviceName: string,
    methodName: string,
    payload: Record<string, unknown>,
    metadata?: Record<string, string>,
  ): Promise<GrpcResponse<TRes>> {
    try {
      const data = await this.callUnary<Record<string, unknown>, TRes>(
        serviceName,
        methodName,
        payload,
      );
      return { data, metadata };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        `Service ${serviceName} is unavailable`,
      );
    }
  }

  /**
   * Get or create a gRPC channel for a service.
   */
  private getOrCreateChannel(
    serviceName: string,
    serviceUrl: string,
  ): grpc.Channel {
    let channel = this.channels.get(serviceName);
    if (!channel) {
      channel = new grpc.Channel(
        serviceUrl,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 10000,
          'grpc.max_receive_message_length': 10 * 1024 * 1024, // 10MB
        },
      );
      this.channels.set(serviceName, channel);
      this.logger.log(`Created gRPC channel: ${serviceName} → ${serviceUrl}`);
    }
    return channel;
  }

  /**
   * Resolve the gRPC URL for a downstream service from configuration.
   */
  private getServiceUrl(serviceName: string): string {
    const urlMap: Record<string, string> = {
      'question-service': this.configService.get('grpc.questionServiceUrl', {
        infer: true,
      }),
      'paper-generator': this.configService.get('grpc.paperGeneratorUrl', {
        infer: true,
      }),
      'crypto-lifecycle': this.configService.get('grpc.cryptoLifecycleUrl', {
        infer: true,
      }),
      'exam-session-service': this.configService.get(
        'grpc.examSessionServiceUrl',
        { infer: true },
      ),
      'collusion-engine': this.configService.get('grpc.collusionEngineUrl', {
        infer: true,
      }),
      'blockchain-service': this.configService.get(
        'grpc.blockchainServiceUrl',
        { infer: true },
      ),
    };

    const url = urlMap[serviceName];
    if (!url) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    return url;
  }

  /**
   * Map gRPC status codes to NestJS HTTP exceptions.
   */
  private mapGrpcError(
    error: grpc.ServiceError,
    serviceName: string,
  ): Error {
    this.logger.error(
      `gRPC error from ${serviceName}: code=${error.code} message=${error.message}`,
    );

    return new ServiceUnavailableException(
      `Downstream service ${serviceName} error: ${error.message}`,
    );
  }
}
