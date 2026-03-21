import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulingService } from './scheduling.service';
import { KmsModule } from '../kms/kms.module';

@Module({
  imports: [ConfigModule, KmsModule],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
