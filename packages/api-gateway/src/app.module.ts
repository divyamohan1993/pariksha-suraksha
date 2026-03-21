import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ProxyModule } from './proxy/proxy.module';
import { JwtAuthGuard, RbacGuard, RateLimitGuard } from './guards';
import {
  AuditInterceptor,
  LoggingInterceptor,
  TimeoutInterceptor,
} from './interceptors';
import { AllExceptionsFilter } from './filters';

/**
 * Root application module for the API Gateway.
 *
 * Registers:
 * - Global guards: JwtAuthGuard → RbacGuard → RateLimitGuard (defense in depth)
 * - Global interceptors: LoggingInterceptor → AuditInterceptor → TimeoutInterceptor
 * - Global filters: AllExceptionsFilter (standardized error responses)
 * - Feature modules: AuthModule, HealthModule, ProxyModule
 */
@Module({
  imports: [
    // Configuration — loads environment variables and validates at startup
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // Rate limiting — token bucket: 100 requests/minute default
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Feature modules
    AuthModule,
    HealthModule,
    ProxyModule,
  ],
  providers: [
    // Global exception filter — catches all unhandled exceptions
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global guards — applied in order: JWT → RBAC → Rate Limit
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },

    // Global interceptors — applied in order: Logging → Timeout → Audit
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
