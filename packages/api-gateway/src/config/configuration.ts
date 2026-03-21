/**
 * Environment-based configuration for the API Gateway.
 * All required environment variables are validated at startup.
 */

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwt: {
    publicKey: string;
    privateKey: string;
    adminExpiresIn: string;
    candidateExpiresInMinutes: number;
    issuer: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  redis: {
    url: string;
  };
  gcp: {
    projectId: string;
    logName: string;
  };
  grpc: {
    questionServiceUrl: string;
    paperGeneratorUrl: string;
    cryptoLifecycleUrl: string;
    examSessionServiceUrl: string;
    collusionEngineUrl: string;
    blockchainServiceUrl: string;
  };
  cors: {
    origins: string[];
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    publicKey: process.env.JWT_PUBLIC_KEY || '',
    privateKey: process.env.JWT_PRIVATE_KEY || '',
    adminExpiresIn: '1h',
    candidateExpiresInMinutes: parseInt(
      process.env.CANDIDATE_TOKEN_EXTRA_MINUTES || '30',
      10,
    ),
    issuer: 'pariksha-suraksha',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/google/callback',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || '',
    logName: process.env.GCP_LOG_NAME || 'api-gateway',
  },
  grpc: {
    questionServiceUrl:
      process.env.QUESTION_SERVICE_URL || 'question-service:50051',
    paperGeneratorUrl:
      process.env.PAPER_GENERATOR_URL || 'paper-generator:50051',
    cryptoLifecycleUrl:
      process.env.CRYPTO_LIFECYCLE_URL || 'crypto-lifecycle:50051',
    examSessionServiceUrl:
      process.env.EXAM_SESSION_SERVICE_URL || 'exam-session-service:50051',
    collusionEngineUrl:
      process.env.COLLUSION_ENGINE_URL || 'collusion-engine:50051',
    blockchainServiceUrl:
      process.env.BLOCKCHAIN_SERVICE_URL || 'blockchain-service:50051',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3001').split(','),
  },
});

/**
 * Validates that all required environment variables are set.
 * Called during application bootstrap — fails fast if anything is missing.
 */
export function validateEnvironment(): void {
  const required: string[] = [
    'JWT_PUBLIC_KEY',
    'JWT_PRIVATE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
