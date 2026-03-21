export default () => ({
  port: parseInt(process.env.PORT || '5005', 10),
  env: process.env.NODE_ENV || 'development',

  firestore: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
  },

  pubsub: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    collusionTriggerTopic:
      process.env.COLLUSION_TRIGGER_TOPIC || 'collusion-detection-trigger',
  },

  storage: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    reportsBucket: process.env.GCS_REPORTS_BUCKET || 'pariksha-reports',
  },

  bigquery: {
    projectId: process.env.GCP_PROJECT_ID || 'pariksha-suraksha',
    dataset: process.env.BQ_DATASET || 'pariksha_analytics',
  },

  collusion: {
    /** False positive rate threshold for flagging pairs. */
    fprThreshold: parseFloat(
      process.env.COLLUSION_FPR_THRESHOLD || '0.0001',
    ),
  },
});
