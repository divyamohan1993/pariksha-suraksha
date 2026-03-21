import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('BlockchainService');

  // Create HTTP application
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global validation pipe for all HTTP endpoints
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Connect gRPC microservice
  const grpcUrl = process.env.GRPC_URL || '0.0.0.0:5006';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'pariksha.blockchain',
      protoPath: join(__dirname, '../../proto/blockchain_service.proto'),
      url: grpcUrl,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  // Start all microservices (gRPC)
  await app.startAllMicroservices();
  logger.log(`gRPC microservice listening on ${grpcUrl}`);

  // Start HTTP server on the same port number (different protocol)
  const httpPort = parseInt(process.env.HTTP_PORT || '5006', 10);
  await app.listen(httpPort);
  logger.log(`HTTP server listening on port ${httpPort}`);
}

bootstrap();
