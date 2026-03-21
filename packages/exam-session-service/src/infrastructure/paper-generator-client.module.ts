import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

export const PAPER_GENERATOR_SERVICE = 'PAPER_GENERATOR_SERVICE';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PAPER_GENERATOR_SERVICE,
        useFactory: (config: ConfigService) => {
          const logger = new Logger('PaperGeneratorClientModule');
          const url = config.get<string>('grpc.paperGeneratorUrl');
          logger.log(`Paper Generator gRPC target: ${url}`);

          return {
            transport: Transport.GRPC,
            options: {
              package: 'paper_generator',
              protoPath: join(__dirname, '../proto/paper-generator.proto'),
              url,
              maxReceiveMessageLength: 10 * 1024 * 1024,
              maxSendMessageLength: 10 * 1024 * 1024,
            },
          };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class PaperGeneratorClientModule {}
