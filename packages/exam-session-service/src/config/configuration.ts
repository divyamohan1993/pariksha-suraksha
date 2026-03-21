export default () => ({
  port: parseInt(process.env.PORT || '5004', 10),
  env: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    username: process.env.REDIS_USERNAME || 'exam-session',
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: '',
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  },

  firestore: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
  },

  storage: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    backupBucket: process.env.GCS_BACKUP_BUCKET || 'pariksha-backups',
    responseBucket: process.env.GCS_RESPONSE_BUCKET || 'pariksha-responses',
  },

  grpc: {
    paperGeneratorUrl:
      process.env.PAPER_GENERATOR_GRPC_URL || 'localhost:5002',
    blockchainServiceUrl:
      process.env.BLOCKCHAIN_SERVICE_GRPC_URL || 'localhost:5003',
  },

  encryption: {
    /** Base64-encoded exam KEK — in production, fetched from Cloud KMS. */
    examKekBase64: process.env.EXAM_KEK_BASE64 || '',
  },

  checkpoint: {
    intervalMs: parseInt(
      process.env.CHECKPOINT_INTERVAL_MS || '30000',
      10,
    ),
    /** TTL for checkpoint keys in Redis (seconds). Defaults to exam duration + 1h. */
    ttlSeconds: parseInt(
      process.env.CHECKPOINT_TTL_SECONDS || '14400',
      10,
    ),
  },
});
