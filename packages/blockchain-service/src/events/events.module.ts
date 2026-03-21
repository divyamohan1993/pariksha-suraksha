import { Module } from '@nestjs/common';
import { MerkleModule } from '../merkle/merkle.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [MerkleModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
