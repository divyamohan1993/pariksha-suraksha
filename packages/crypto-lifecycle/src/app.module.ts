import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config';
import { KmsModule } from './kms/kms.module';
import { TlpModule } from './tlp/tlp.module';
import { ShamirModule } from './shamir/shamir.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { HealthModule } from './health/health.module';
import { CryptoLifecycleController } from './crypto-lifecycle.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    KmsModule,
    TlpModule,
    ShamirModule,
    SchedulingModule,
    HealthModule,
  ],
  controllers: [CryptoLifecycleController],
})
export class AppModule {}
