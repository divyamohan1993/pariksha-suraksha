###############################################################################
# Firestore Module — Database in Native Mode + Composite Indexes
###############################################################################

locals {
  # Map GCP region to Firestore location
  firestore_location = var.region == "asia-south1" ? "nam5" : var.region
}

resource "google_firestore_database" "pariksha" {
  provider    = google-beta
  project     = var.project_id
  name        = "pariksha-${var.environment}"
  location_id = local.firestore_location
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  delete_protection_state = var.environment == "prod" ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
}

# -----------------------------------------------------------------------------
# Composite Indexes for Common Queries
# -----------------------------------------------------------------------------

# Questions by subject + topic + calibration status
resource "google_firestore_index" "questions_by_subject_topic" {
  project    = var.project_id
  database   = google_firestore_database.pariksha.name
  collection = "questions"

  fields {
    field_path = "metadata.subject"
    order      = "ASCENDING"
  }
  fields {
    field_path = "metadata.topic"
    order      = "ASCENDING"
  }
  fields {
    field_path = "metadata.calibrationDate"
    order      = "DESCENDING"
  }
}

# Questions by bloom level + difficulty for blueprint matching
resource "google_firestore_index" "questions_by_bloom_difficulty" {
  project    = var.project_id
  database   = google_firestore_database.pariksha.name
  collection = "questions"

  fields {
    field_path = "metadata.bloomLevel"
    order      = "ASCENDING"
  }
  fields {
    field_path = "irtParams.bMean"
    order      = "ASCENDING"
  }
  fields {
    field_path = "metadata.subject"
    order      = "ASCENDING"
  }
}

# Exams by status + date for dashboard listing
resource "google_firestore_index" "exams_by_status_date" {
  project    = var.project_id
  database   = google_firestore_database.pariksha.name
  collection = "exams"

  fields {
    field_path = "metadata.status"
    order      = "ASCENDING"
  }
  fields {
    field_path = "metadata.date"
    order      = "DESCENDING"
  }
}

# Candidates by examId + centerId for collusion queries
resource "google_firestore_index" "candidates_by_exam_center" {
  project    = var.project_id
  database   = google_firestore_database.pariksha.name
  collection = "candidates"

  fields {
    field_path = "profile.examId"
    order      = "ASCENDING"
  }
  fields {
    field_path = "profile.centerId"
    order      = "ASCENDING"
  }
  fields {
    field_path = "profile.seatNum"
    order      = "ASCENDING"
  }
}

# Collusion results by examId + flagged status
resource "google_firestore_index" "collusion_flagged" {
  project    = var.project_id
  database   = google_firestore_database.pariksha.name
  collection = "collusionResults"

  fields {
    field_path = "examId"
    order      = "ASCENDING"
  }
  fields {
    field_path = "flagged"
    order      = "ASCENDING"
  }
  fields {
    field_path = "logLambda"
    order      = "DESCENDING"
  }
}
