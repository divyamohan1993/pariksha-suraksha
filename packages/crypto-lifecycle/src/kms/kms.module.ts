import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KmsService } from './kms.service';

@Module({
  imports: [ConfigModule],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}
