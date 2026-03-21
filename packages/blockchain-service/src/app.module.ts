import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FabricModule } from './fabric/fabric.module';
import { MerkleModule } from './merkle/merkle.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    FabricModule,
    MerkleModule,
    EventsModule,
  ],
})
export class AppModule {}
