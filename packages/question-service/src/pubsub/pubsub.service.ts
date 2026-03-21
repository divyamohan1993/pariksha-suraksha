import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PubSub, Topic } from '@google-cloud/pubsub';

export interface PubSubMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId: string;
}

@Injectable()
export class PubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private pubsub!: PubSub;
  private readonly topicCache = new Map<string, Topic>();

  async onModuleInit(): Promise<void> {
    this.pubsub = new PubSub({
      projectId: process.env['GCP_PROJECT_ID'] || 'pariksha-suraksha',
    });
    this.logger.log('PubSub client initialized');
  }

  async onModuleDestroy(): Promise<void> {
    for (const topic of this.topicCache.values()) {
      await topic.flush();
    }
    await this.pubsub.close();
    this.logger.log('PubSub client closed');
  }

  private getTopic(topicName: string): Topic {
    let topic = this.topicCache.get(topicName);
    if (!topic) {
      topic = this.pubsub.topic(topicName, {
        batching: {
          maxMessages: 100,
          maxMilliseconds: 100,
        },
      });
      this.topicCache.set(topicName, topic);
    }
    return topic;
  }

  async publish(topicName: string, message: PubSubMessage): Promise<string> {
    const topic = this.getTopic(topicName);
    const dataBuffer = Buffer.from(JSON.stringify(message));

    try {
      const messageId = await topic.publishMessage({
        data: dataBuffer,
        attributes: {
          type: message.type,
          correlationId: message.correlationId,
          timestamp: message.timestamp,
        },
      });
      this.logger.debug(
        `Published message ${messageId} to topic ${topicName} (type: ${message.type})`,
      );
      return messageId;
    } catch (error) {
      this.logger.error(
        `Failed to publish message to topic ${topicName}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async publishToIrtCalibration(templateId: string, correlationId: string): Promise<string> {
    return this.publish('irt-calibration-trigger', {
      type: 'irt_calibration_request',
      payload: {
        templateId,
        action: 'calibrate',
        requestedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      correlationId,
    });
  }

  async publishToMatrixSolver(
    examId: string,
    correlationId: string,
  ): Promise<string> {
    return this.publish('matrix-solver-trigger', {
      type: 'matrix_solver_request',
      payload: {
        examId,
        action: 'solve',
        requestedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      correlationId,
    });
  }
}
