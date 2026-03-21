import { Module } from '@nestjs/common';
import { CheckpointService } from './checkpoint.service';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [EncryptionModule],
  providers: [CheckpointService],
  exports: [CheckpointService],
})
export class CheckpointModule {}
