import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GrpcClientService } from './grpc-client.service';
import { QuestionsProxyController, ExamsProxyController } from './questions.proxy';
import { PapersProxyController } from './papers.proxy';
import { CryptoProxyController } from './crypto.proxy';
import { ExamSessionProxyController } from './exam-session.proxy';
import { CollusionProxyController } from './collusion.proxy';
import { AuditProxyController } from './audit.proxy';
import { VerifyProxyController } from './verify.proxy';

@Module({
  imports: [ConfigModule],
  controllers: [
    QuestionsProxyController,
    ExamsProxyController,
    PapersProxyController,
    CryptoProxyController,
    ExamSessionProxyController,
    CollusionProxyController,
    AuditProxyController,
    VerifyProxyController,
  ],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class ProxyModule {}
