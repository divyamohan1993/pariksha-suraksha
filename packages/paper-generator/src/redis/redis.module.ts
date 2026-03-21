import { Module, Global, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const logger = new Logger('RedisModule');

    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      username: process.env.REDIS_USERNAME || 'paper-generator',
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis connection retry limit reached');
          return null;
        }
        return Math.min(times * 200, 5000);
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    redis.on('connect', () => logger.log('Redis connected'));
    redis.on('ready', () => logger.log('Redis ready'));
    redis.on('error', (err) => logger.error('Redis error', err.message));
    redis.on('close', () => logger.warn('Redis connection closed'));
    redis.on('reconnecting', () => logger.log('Redis reconnecting'));

    return redis;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor() {}

  async onModuleDestroy() {
    // Connection cleanup is handled by the provider lifecycle
  }
}
