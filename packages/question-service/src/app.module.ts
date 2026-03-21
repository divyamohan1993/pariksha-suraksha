import { Module } from '@nestjs/common';
import { FirestoreModule } from './firestore/firestore.module';
import { PubSubModule } from './pubsub/pubsub.module';
import { GeminiModule } from './gemini/gemini.module';
import { TemplatesModule } from './templates/templates.module';
import { ValidationModule } from './validation/validation.module';
import { ExamModule } from './exam/exam.module';
import { GrpcController } from './grpc/grpc.controller';

@Module({
  imports: [
    FirestoreModule,
    PubSubModule,
    GeminiModule,
    TemplatesModule,
    ValidationModule,
    ExamModule,
  ],
  controllers: [GrpcController],
})
export class AppModule {}
