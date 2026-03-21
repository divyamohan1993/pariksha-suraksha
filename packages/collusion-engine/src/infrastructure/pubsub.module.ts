import { Module, Global, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSub } from '@google-cloud/pubsub';

export const PUBSUB = Symbol('PUBSUB');

@Global()
@Module({
  providers: [
    {
      provide: PUBSUB,
      useFactory: (config: ConfigService): PubSub => {
        const logger = new Logger('PubSubModule');
        const projectId = config.get<string>('pubsub.projectId');

        logger.log(`Initializing Pub/Sub — project=${projectId}`);

        return new PubSub({ projectId });
      },
      inject: [ConfigService],
    },
  ],
  exports: [PUBSUB],
})
export class PubSubModule implements OnModuleDestroy {
  constructor(@Inject(PUBSUB) private readonly pubsub: PubSub) {}

  async onModuleDestroy(): Promise<void> {
    await this.pubsub.close();
  }
}
