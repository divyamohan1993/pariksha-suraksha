import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CollusionEngine');
  const port = parseInt(process.env.PORT || '5005', 10);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  // Connect gRPC microservice on the same port
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'collusion_engine',
      protoPath: join(__dirname, 'proto/collusion-engine.proto'),
      url: `0.0.0.0:${port}`,
      maxReceiveMessageLength: 10 * 1024 * 1024,
      maxSendMessageLength: 10 * 1024 * 1024,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);

  logger.log(`Collusion Engine running — HTTP + gRPC on port ${port}`);
}

bootstrap();
