/**
 * Central configuration for the crypto-lifecycle microservice.
 * All configuration is loaded from environment variables with sensible defaults for local development.
 */
export interface CryptoLifecycleConfig {
  port: number;
  grpcPort: number;
  nodeEnv: string;

  // GCP project
  gcpProjectId: string;
  gcpRegion: string;

  // Cloud KMS
  kmsKeyRing: string;
  kmsKeyName: string;
  kmsLocation: string;

  // GCS
  gcsBucketEncryptedQuestions: string;

  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisUsername: string;

  // Firestore
  firestoreDatabase: string;

  // Pub/Sub
  pubsubTlpTopic: string;

  // Cloud Scheduler
  schedulerLocation: string;
  serviceUrl: string;
  schedulerServiceAccountEmail: string;

  // Blockchain gRPC
  blockchainServiceHost: string;
  blockchainServicePort: number;

  // Paper generator gRPC
  paperGeneratorHost: string;
  paperGeneratorPort: number;

  // Key retention
  keyRetentionDays: number;

  // Exam duration default
  defaultExamDurationMinutes: number;
}

export default (): { crypto: CryptoLifecycleConfig } => ({
  crypto: {
    port: parseInt(process.env.PORT || '5003', 10),
    grpcPort: parseInt(process.env.GRPC_PORT || '5003', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    gcpProjectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    gcpRegion: process.env.GCP_REGION || 'asia-south1',

    kmsKeyRing: process.env.KMS_KEY_RING || 'pariksha-keyring',
    kmsKeyName: process.env.KMS_KEY_NAME || 'pariksha-master',
    kmsLocation: process.env.KMS_LOCATION || 'asia-south1',

    gcsBucketEncryptedQuestions:
      process.env.GCS_BUCKET_ENCRYPTED_QUESTIONS || 'pariksha-encrypted-questions',

    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
    redisPassword: process.env.REDIS_PASSWORD || '',
    redisUsername: process.env.REDIS_USERNAME || 'crypto-lifecycle',

    firestoreDatabase: process.env.FIRESTORE_DATABASE || '(default)',

    pubsubTlpTopic: process.env.PUBSUB_TLP_TOPIC || 'tlp-generation-trigger',

    schedulerLocation: process.env.SCHEDULER_LOCATION || 'asia-south1',
    serviceUrl:
      process.env.SERVICE_URL || 'http://crypto-lifecycle.pariksha-api.svc.cluster.local:5003',
    schedulerServiceAccountEmail:
      process.env.SCHEDULER_SA_EMAIL || 'scheduler@pariksha-suraksha.iam.gserviceaccount.com',

    blockchainServiceHost:
      process.env.BLOCKCHAIN_SERVICE_HOST ||
      'blockchain-service.pariksha-api.svc.cluster.local',
    blockchainServicePort: parseInt(process.env.BLOCKCHAIN_SERVICE_PORT || '5001', 10),

    paperGeneratorHost:
      process.env.PAPER_GENERATOR_HOST ||
      'paper-generator.pariksha-api.svc.cluster.local',
    paperGeneratorPort: parseInt(process.env.PAPER_GENERATOR_PORT || '5002', 10),

    keyRetentionDays: parseInt(process.env.KEY_RETENTION_DAYS || '90', 10),

    defaultExamDurationMinutes: parseInt(
      process.env.DEFAULT_EXAM_DURATION_MINUTES || '180',
      10,
    ),
  },
});
