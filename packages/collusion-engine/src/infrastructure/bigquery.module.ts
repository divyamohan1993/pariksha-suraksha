import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigQuery } from '@google-cloud/bigquery';

export const BIGQUERY = Symbol('BIGQUERY');

@Global()
@Module({
  providers: [
    {
      provide: BIGQUERY,
      useFactory: (config: ConfigService): BigQuery => {
        const logger = new Logger('BigQueryModule');
        const projectId = config.get<string>('bigquery.projectId');

        logger.log(`Initializing BigQuery — project=${projectId}`);

        return new BigQuery({ projectId });
      },
      inject: [ConfigService],
    },
  ],
  exports: [BIGQUERY],
})
export class BigQueryModule {}
