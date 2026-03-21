import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

export const BLOCKCHAIN_SERVICE = 'BLOCKCHAIN_SERVICE';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: BLOCKCHAIN_SERVICE,
        useFactory: (config: ConfigService) => {
          const logger = new Logger('BlockchainClientModule');
          const url = config.get<string>('grpc.blockchainServiceUrl');
          logger.log(`Blockchain gRPC target: ${url}`);

          return {
            transport: Transport.GRPC,
            options: {
              package: 'blockchain',
              protoPath: join(__dirname, '../proto/blockchain.proto'),
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
export class BlockchainClientModule {}
