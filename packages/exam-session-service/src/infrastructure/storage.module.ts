import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

export const GCS_STORAGE = Symbol('GCS_STORAGE');

@Global()
@Module({
  providers: [
    {
      provide: GCS_STORAGE,
      useFactory: (config: ConfigService): Storage => {
        const logger = new Logger('StorageModule');
        const projectId = config.get<string>('storage.projectId');

        logger.log(`Initializing GCS — project=${projectId}`);

        return new Storage({ projectId });
      },
      inject: [ConfigService],
    },
  ],
  exports: [GCS_STORAGE],
})
export class StorageModule {}
