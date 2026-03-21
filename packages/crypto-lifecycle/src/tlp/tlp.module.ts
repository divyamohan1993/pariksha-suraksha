import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TlpService } from './tlp.service';

@Module({
  imports: [ConfigModule],
  providers: [TlpService],
  exports: [TlpService],
})
export class TlpModule {}
