import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { TriggersModule } from './triggers/triggers.module';
import { ResultsModule } from './results/results.module';
import { HealthController } from './health/health.controller';
import { FirestoreModule } from './infrastructure/firestore.module';
import { PubSubModule } from './infrastructure/pubsub.module';
import { StorageModule } from './infrastructure/storage.module';
import { BigQueryModule } from './infrastructure/bigquery.module';

import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TerminusModule,
    FirestoreModule,
    PubSubModule,
    StorageModule,
    BigQueryModule,
    TriggersModule,
    ResultsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
