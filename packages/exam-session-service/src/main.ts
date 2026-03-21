import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('ExamSessionService');
  const port = parseInt(process.env.PORT || '5004', 10);

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
      package: 'exam_session',
      protoPath: join(__dirname, 'proto/exam-session.proto'),
      url: `0.0.0.0:${port}`,
      maxReceiveMessageLength: 10 * 1024 * 1024, // 10MB
      maxSendMessageLength: 10 * 1024 * 1024,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);

  logger.log(`Exam Session Service running — HTTP + gRPC on port ${port}`);
}

bootstrap();
