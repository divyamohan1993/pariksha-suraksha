import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators';

/**
 * Health check responses for Kubernetes probes.
 */
interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    name: string;
    status: 'up' | 'down';
    details?: string;
  }[];
}

/**
 * Health check controller.
 * Provides readiness and liveness endpoints for Kubernetes probes.
 * All endpoints are public (no auth required).
 */
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  /**
   * GET /health
   * Combined health check — returns overall status and individual service checks.
   * Used by Kubernetes readiness probe.
   */
  @Public()
  @Get()
  getHealth(): HealthStatus {
    const checks = [
      {
        name: 'api-gateway',
        status: 'up' as const,
        details: 'Service is running',
      },
    ];

    const allUp = checks.every((c) => c.status === 'up');

    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.APP_VERSION || '1.0.0',
      checks,
    };
  }

  /**
   * GET /health/live
   * Liveness probe — returns 200 if the process is alive.
   * Kubernetes restarts the pod if this fails.
   */
  @Public()
  @Get('live')
  getLiveness(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * GET /health/ready
   * Readiness probe — returns 200 if the service can handle traffic.
   * Kubernetes removes the pod from the load balancer if this fails.
   */
  @Public()
  @Get('ready')
  getReadiness(): { status: string; ready: boolean } {
    // In production, this would check downstream service connectivity:
    // - Redis ping
    // - gRPC channel health for downstream services
    const ready = true;

    return {
      status: ready ? 'ok' : 'not_ready',
      ready,
    };
  }
}
