import { Controller, Get, Inject, Logger } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthCheckResult,
} from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Liveness probe — is the process alive?
   * Used by Kubernetes liveness probe.
   */
  @Get('live')
  @HealthCheck()
  async liveness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checkProcess(),
    ]);
  }

  /**
   * Readiness probe — can the service handle requests?
   * Checks Redis connectivity (critical for O(1) paper lookup).
   * Used by Kubernetes readiness probe.
   */
  @Get('ready')
  @HealthCheck()
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checkRedis(),
    ]);
  }

  /**
   * Process health check — always healthy if the controller is reachable.
   */
  private async checkProcess(): Promise<HealthIndicatorResult> {
    return {
      process: {
        status: 'up',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
      },
    };
  }

  /**
   * Redis health check — verifies connectivity via PING.
   * The O(1) paper lookup depends entirely on Redis being available.
   */
  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      const status = this.redis.status;
      if (status !== 'ready') {
        return {
          redis: {
            status: 'down',
            message: `Redis status: ${status}`,
          },
        };
      }

      const pingResult = await this.redis.ping();
      if (pingResult !== 'PONG') {
        return {
          redis: {
            status: 'down',
            message: `Unexpected PING response: ${pingResult}`,
          },
        };
      }

      return {
        redis: {
          status: 'up',
        },
      };
    } catch (error) {
      this.logger.error('Redis health check failed', (error as Error).message);
      return {
        redis: {
          status: 'down',
          message: (error as Error).message,
        },
      };
    }
  }
}
