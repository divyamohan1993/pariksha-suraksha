import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RenderingModule } from '../rendering/rendering.module';

@Module({
  imports: [RenderingModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
