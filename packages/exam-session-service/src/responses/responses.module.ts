import { Module } from '@nestjs/common';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { CheckpointModule } from '../checkpoint/checkpoint.module';

@Module({
  imports: [EncryptionModule, CheckpointModule],
  controllers: [ResponsesController],
  providers: [ResponsesService],
  exports: [ResponsesService],
})
export class ResponsesModule {}
