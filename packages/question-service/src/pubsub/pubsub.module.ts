import { Module, Global } from '@nestjs/common';
import { PubSubService } from './pubsub.service';

@Global()
@Module({
  providers: [PubSubService],
  exports: [PubSubService],
})
export class PubSubModule {}
