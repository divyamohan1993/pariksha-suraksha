import { Module, Global, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const host = config.get<string>('redis.host');
        const port = config.get<number>('redis.port');
        const username = config.get<string>('redis.username');
        const password = config.get<string>('redis.password');
        const db = config.get<number>('redis.db');
        const tls = config.get<object | undefined>('redis.tls');

        logger.log(`Connecting to Redis — host=${host}:${port}, user=${username}`);

        const client = new Redis({
          host,
          port,
          username: username || undefined,
          password: password || undefined,
          db,
          tls: tls || undefined,
          retryStrategy: (times: number) => {
            if (times > 10) {
              logger.error('Redis max retries reached, giving up');
              return null;
            }
            const delay = Math.min(times * 200, 5000);
            logger.warn(`Redis retry #${times}, next attempt in ${delay}ms`);
            return delay;
          },
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });

        client.on('error', (err) => {
          logger.error(`Redis error: ${err.message}`);
        });

        client.on('connect', () => {
          logger.log('Redis connected');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
