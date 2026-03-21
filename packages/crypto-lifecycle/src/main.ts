import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CryptoLifecycle');

  // Create the HTTP application
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Global validation pipe (defense in depth layer 3)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // Connect gRPC microservice on the same port (hybrid application)
  const grpcPort = parseInt(process.env.GRPC_PORT || process.env.PORT || '5003', 10);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['blockchain', 'papergenerator'],
      protoPath: [
        join(__dirname, 'proto', 'blockchain.proto'),
        join(__dirname, 'proto', 'paper-generator.proto'),
      ],
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  // Start all microservices (gRPC)
  await app.startAllMicroservices();
  logger.log(`gRPC microservice listening on port ${grpcPort}`);

  // Start HTTP server on the same port
  const httpPort = parseInt(process.env.PORT || '5003', 10);
  await app.listen(httpPort);

  logger.log(`Crypto Lifecycle HTTP server listening on port ${httpPort}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

void bootstrap();
