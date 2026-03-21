import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { CheckpointModule } from './checkpoint/checkpoint.module';
import { ResponsesModule } from './responses/responses.module';
import { EncryptionModule } from './encryption/encryption.module';
import { HealthController } from './health/health.controller';
import { FirestoreModule } from './infrastructure/firestore.module';
import { RedisModule } from './infrastructure/redis.module';
import { StorageModule } from './infrastructure/storage.module';
import { BlockchainClientModule } from './infrastructure/blockchain-client.module';
import { PaperGeneratorClientModule } from './infrastructure/paper-generator-client.module';

import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TerminusModule,
    FirestoreModule,
    RedisModule,
    StorageModule,
    BlockchainClientModule,
    PaperGeneratorClientModule,
    EncryptionModule,
    CheckpointModule,
    ResponsesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
