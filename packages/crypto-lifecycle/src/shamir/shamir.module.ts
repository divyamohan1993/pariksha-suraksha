import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShamirService } from './shamir.service';
import { KmsModule } from '../kms/kms.module';

@Module({
  imports: [ConfigModule, KmsModule],
  providers: [ShamirService],
  exports: [ShamirService],
})
export class ShamirModule {}
