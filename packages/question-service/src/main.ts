import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Create the HTTP application
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: process.env['NODE_ENV'] === 'production',
    }),
  );

  // Enable CORS for API Gateway
  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    credentials: true,
  });

  // Set global prefix
  app.setGlobalPrefix('api/v1');

  // Connect gRPC microservice
  const grpcPort = parseInt(process.env['GRPC_PORT'] || '5001', 10);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'question',
      protoPath: join(__dirname, 'proto/question-service.proto'),
      url: `0.0.0.0:${grpcPort}`,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  // Start all microservices
  await app.startAllMicroservices();
  logger.log(`gRPC server listening on port ${grpcPort}`);

  // Start HTTP server
  const httpPort = parseInt(process.env['HTTP_PORT'] || '3001', 10);
  await app.listen(httpPort);
  logger.log(`HTTP server listening on port ${httpPort}`);
  logger.log(`Question Service started successfully`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start Question Service', err);
  process.exit(1);
});
