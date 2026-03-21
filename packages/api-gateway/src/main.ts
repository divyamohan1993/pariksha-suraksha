import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { validateEnvironment } from './config';

async function bootstrap(): Promise<void> {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger('Bootstrap');

  // Helmet — secure HTTP headers
  app.use(helmet());

  // Compression — gzip responses
  app.use(compression());

  // CORS — restrict allowed origins
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3001'];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-CAPTCHA-Token',
    ],
    credentials: true,
    maxAge: 86400,
  });

  // Global validation pipe — defense in depth: whitelist unknown properties,
  // reject non-whitelisted fields, auto-transform payloads to DTO classes.
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

  // Global prefix for API versioning
  app.setGlobalPrefix('api/v1', {
    exclude: ['auth/(.*)', 'health'],
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);

  logger.log(`API Gateway listening on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

void bootstrap();
