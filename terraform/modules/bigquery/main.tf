###############################################################################
# BigQuery Module — Analytics Dataset, Tables, Materialized Views
###############################################################################

resource "google_bigquery_dataset" "pariksha_analytics" {
  dataset_id    = "pariksha_analytics_${var.environment}"
  project       = var.project_id
  location      = var.region
  friendly_name = "ParikshaSuraksha Analytics (${var.environment})"
  description   = "IRT calibration data, exam results, collusion analysis for ParikshaSuraksha"

  default_table_expiration_ms = null # No auto-expiration

  labels = var.labels

  delete_contents_on_destroy = var.environment == "dev" ? true : false
}

# -----------------------------------------------------------------------------
# Table: field_test_responses — Raw calibration data
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "field_test_responses" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "field_test_responses"
  project             = var.project_id
  deletion_protection = var.environment == "prod" ? true : false

  time_partitioning {
    type  = "DAY"
    field = "response_timestamp"
  }

  clustering = ["template_id", "instantiation_id"]

  labels = var.labels

  schema = jsonencode([
    {
      name        = "response_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Unique response identifier"
    },
    {
      name        = "candidate_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Anonymous candidate identifier for field testing"
    },
    {
      name        = "template_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Question template ID"
    },
    {
      name        = "instantiation_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Parameter instantiation ID"
    },
    {
      name        = "response"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Selected answer option (0-3 for A-D)"
    },
    {
      name        = "correct"
      type        = "BOOLEAN"
      mode        = "REQUIRED"
      description = "Whether the response was correct"
    },
    {
      name        = "time_spent_ms"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Time spent on question in milliseconds"
    },
    {
      name        = "response_timestamp"
      type        = "TIMESTAMP"
      mode        = "REQUIRED"
      description = "When the response was recorded"
    },
    {
      name        = "exam_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Field test exam identifier"
    },
    {
      name        = "subject"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Subject area"
    },
    {
      name        = "topic"
      type        = "STRING"
      mode        = "NULLABLE"
      description = "Topic within subject"
    }
  ])
}

# -----------------------------------------------------------------------------
# Table: irt_parameters — Fitted IRT params per instantiation
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "irt_parameters" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "irt_parameters"
  project             = var.project_id
  deletion_protection = var.environment == "prod" ? true : false

  clustering = ["template_id"]

  labels = var.labels

  schema = jsonencode([
    {
      name        = "template_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Question template ID"
    },
    {
      name        = "instantiation_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Parameter instantiation ID"
    },
    {
      name        = "a_discrimination"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "3PL discrimination parameter"
    },
    {
      name        = "b_difficulty"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "3PL difficulty parameter"
    },
    {
      name        = "c_guessing"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "3PL pseudo-guessing parameter"
    },
    {
      name        = "a_std_error"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Standard error for a parameter"
    },
    {
      name        = "b_std_error"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Standard error for b parameter"
    },
    {
      name        = "c_std_error"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Standard error for c parameter"
    },
    {
      name        = "sample_size"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of responses used for fitting"
    },
    {
      name        = "convergence_status"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "CONVERGED, FAILED, or MAX_ITERATIONS"
    },
    {
      name        = "calibration_timestamp"
      type        = "TIMESTAMP"
      mode        = "REQUIRED"
      description = "When calibration was performed"
    },
    {
      name        = "model_fit_chi_square"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Chi-square goodness of fit statistic"
    },
    {
      name        = "isomorphic_equivalence"
      type        = "BOOLEAN"
      mode        = "REQUIRED"
      description = "Whether instantiation is within tolerance of template mean"
    }
  ])
}

# -----------------------------------------------------------------------------
# Table: distractor_profiles — Per-question distractor attractiveness
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "distractor_profiles" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "distractor_profiles"
  project             = var.project_id
  deletion_protection = var.environment == "prod" ? true : false

  clustering = ["template_id", "instantiation_id"]

  labels = var.labels

  schema = jsonencode([
    {
      name        = "template_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Question template ID"
    },
    {
      name        = "instantiation_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Parameter instantiation ID"
    },
    {
      name        = "correct_answer"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Correct answer option (0-3)"
    },
    {
      name        = "option_a_probability"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Probability of selecting option A among wrong respondents"
    },
    {
      name        = "option_b_probability"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Probability of selecting option B among wrong respondents"
    },
    {
      name        = "option_c_probability"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Probability of selecting option C among wrong respondents"
    },
    {
      name        = "option_d_probability"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Probability of selecting option D among wrong respondents"
    },
    {
      name        = "sample_size"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of wrong responses used for profiling"
    },
    {
      name        = "profile_timestamp"
      type        = "TIMESTAMP"
      mode        = "REQUIRED"
      description = "When profile was computed"
    }
  ])
}

# -----------------------------------------------------------------------------
# Table: exam_results — Per-candidate scores for post-exam analytics
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "exam_results" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "exam_results"
  project             = var.project_id
  deletion_protection = var.environment == "prod" ? true : false

  time_partitioning {
    type  = "DAY"
    field = "graded_timestamp"
  }

  clustering = ["exam_id", "center_id"]

  labels = var.labels

  schema = jsonencode([
    {
      name        = "candidate_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Candidate identifier"
    },
    {
      name        = "exam_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Exam identifier"
    },
    {
      name        = "center_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Exam center identifier"
    },
    {
      name        = "seat_num"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Seat number"
    },
    {
      name        = "raw_score"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Raw score before equating"
    },
    {
      name        = "equated_score"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "IRT-equated score"
    },
    {
      name        = "theta_estimate"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Estimated ability parameter (theta)"
    },
    {
      name        = "theta_std_error"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "Standard error of theta estimate"
    },
    {
      name        = "total_questions"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Total questions in paper"
    },
    {
      name        = "correct_count"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of correct answers"
    },
    {
      name        = "wrong_count"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of wrong answers"
    },
    {
      name        = "unanswered_count"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of unanswered questions"
    },
    {
      name        = "equating_applied"
      type        = "BOOLEAN"
      mode        = "REQUIRED"
      description = "Whether IRT equating was applied"
    },
    {
      name        = "ks_test_p_value"
      type        = "FLOAT64"
      mode        = "NULLABLE"
      description = "KS test p-value for cross-paper fairness"
    },
    {
      name        = "verification_hash"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "SHA-256 hash for blockchain verification"
    },
    {
      name        = "graded_timestamp"
      type        = "TIMESTAMP"
      mode        = "REQUIRED"
      description = "When grading was completed"
    }
  ])
}

# -----------------------------------------------------------------------------
# Table: collusion_scores — Pairwise log-likelihood ratios per center
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "collusion_scores" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "collusion_scores"
  project             = var.project_id
  deletion_protection = var.environment == "prod" ? true : false

  time_partitioning {
    type  = "DAY"
    field = "analysis_timestamp"
  }

  clustering = ["exam_id", "center_id"]

  labels = var.labels

  schema = jsonencode([
    {
      name        = "pair_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Unique identifier for the candidate pair"
    },
    {
      name        = "exam_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Exam identifier"
    },
    {
      name        = "center_id"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Exam center identifier"
    },
    {
      name        = "candidate_u"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "First candidate in pair"
    },
    {
      name        = "candidate_v"
      type        = "STRING"
      mode        = "REQUIRED"
      description = "Second candidate in pair"
    },
    {
      name        = "shared_question_count"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of shared questions between the pair"
    },
    {
      name        = "same_wrong_count"
      type        = "INTEGER"
      mode        = "REQUIRED"
      description = "Number of matching wrong answers"
    },
    {
      name        = "log_lambda"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Log-likelihood ratio statistic"
    },
    {
      name        = "threshold"
      type        = "FLOAT64"
      mode        = "REQUIRED"
      description = "Detection threshold (calibrated for FPR < 0.0001)"
    },
    {
      name        = "flagged"
      type        = "BOOLEAN"
      mode        = "REQUIRED"
      description = "Whether the pair exceeds collusion threshold"
    },
    {
      name        = "cluster_id"
      type        = "STRING"
      mode        = "NULLABLE"
      description = "Connected component cluster ID for flagged pairs"
    },
    {
      name        = "evidence_report_uri"
      type        = "STRING"
      mode        = "NULLABLE"
      description = "GCS URI for PDF evidence report"
    },
    {
      name        = "analysis_timestamp"
      type        = "TIMESTAMP"
      mode        = "REQUIRED"
      description = "When collusion analysis was performed"
    }
  ])
}

# -----------------------------------------------------------------------------
# View: Latest distractor profiles for collusion detection lookups
# (Cannot use materialized view due to GCP self-join restriction)
# -----------------------------------------------------------------------------
resource "google_bigquery_table" "distractor_profiles_latest" {
  dataset_id          = google_bigquery_dataset.pariksha_analytics.dataset_id
  table_id            = "distractor_profiles_latest_v"
  project             = var.project_id
  deletion_protection = false

  view {
    query = <<-SQL
      SELECT
        dp.*
      FROM `${var.project_id}.${google_bigquery_dataset.pariksha_analytics.dataset_id}.distractor_profiles` dp
      INNER JOIN (
        SELECT
          template_id,
          instantiation_id,
          MAX(profile_timestamp) AS latest_timestamp
        FROM `${var.project_id}.${google_bigquery_dataset.pariksha_analytics.dataset_id}.distractor_profiles`
        GROUP BY template_id, instantiation_id
      ) latest
      ON dp.template_id = latest.template_id
        AND dp.instantiation_id = latest.instantiation_id
        AND dp.profile_timestamp = latest.latest_timestamp
    SQL
    use_legacy_sql = false
  }

  labels = var.labels

  depends_on = [google_bigquery_table.distractor_profiles]
}
