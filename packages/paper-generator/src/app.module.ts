import { Module } from '@nestjs/common';
import { MatrixModule } from './matrix/matrix.module';
import { RenderingModule } from './rendering/rendering.module';
import { CacheModule } from './cache/cache.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    RedisModule,
    CacheModule,
    MatrixModule,
    RenderingModule,
    HealthModule,
  ],
})
export class AppModule {}
