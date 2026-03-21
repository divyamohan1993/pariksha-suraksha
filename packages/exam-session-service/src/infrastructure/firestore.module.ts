import { Module, Global, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Firestore } from '@google-cloud/firestore';

export const FIRESTORE = Symbol('FIRESTORE');

@Global()
@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: (config: ConfigService): Firestore => {
        const logger = new Logger('FirestoreModule');
        const projectId = config.get<string>('firestore.projectId');
        const databaseId = config.get<string>('firestore.databaseId');

        logger.log(
          `Initializing Firestore — project=${projectId}, database=${databaseId}`,
        );

        return new Firestore({
          projectId,
          databaseId,
          ignoreUndefinedProperties: true,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [FIRESTORE],
})
export class FirestoreModule implements OnModuleDestroy {
  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    // Firestore client cleanup is handled automatically
  }
}
