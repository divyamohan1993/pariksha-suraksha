###############################################################################
# Storage Module — GCS Buckets
###############################################################################

# -----------------------------------------------------------------------------
# Encrypted Questions Bucket
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "encrypted_questions" {
  name          = "pariksha-encrypted-questions-${var.environment}-${var.name_suffix}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Field Test Data Bucket
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "field_test_data" {
  name          = "pariksha-field-test-data-${var.environment}-${var.name_suffix}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  versioning {
    enabled = false
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Backups Bucket — lifecycle: delete after 365 days
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "backups" {
  name          = "pariksha-backups-${var.environment}-${var.name_suffix}"
  project       = var.project_id
  location      = var.region
  storage_class = "NEARLINE"

  uniform_bucket_level_access = true

  versioning {
    enabled = false
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Reports Bucket
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "reports" {
  name          = "pariksha-reports-${var.environment}-${var.name_suffix}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  versioning {
    enabled = false
  }

  encryption {
    default_kms_key_name = var.kms_key_id
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}
