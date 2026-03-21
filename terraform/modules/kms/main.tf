###############################################################################
# KMS Module — Key Ring, Crypto Keys, IAM Bindings
###############################################################################

resource "google_kms_key_ring" "pariksha" {
  name     = "pariksha-keyring-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  location = var.region
}

# -----------------------------------------------------------------------------
# Question Encryption Key — encrypts per-question DEKs
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "question_encryption" {
  name     = "question-encryption-key"
  key_ring = google_kms_key_ring.pariksha.id
  purpose  = "ENCRYPT_DECRYPT"

  # 90-day rotation
  rotation_period = "7776000s"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Data Encryption Key — encrypts GCS objects, backups
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key" "data_encryption" {
  name     = "data-encryption-key"
  key_ring = google_kms_key_ring.pariksha.id
  purpose  = "ENCRYPT_DECRYPT"

  # 90-day rotation
  rotation_period = "7776000s"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "HSM"
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# IAM: crypto-lifecycle gets encrypt/decrypt on question-encryption-key
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key_iam_member" "crypto_lifecycle_encrypt_decrypt" {
  crypto_key_id = google_kms_crypto_key.question_encryption.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${var.crypto_lifecycle_sa_email}"
}

# -----------------------------------------------------------------------------
# IAM: question-service gets encrypt-only on question-encryption-key
# (for encrypting new questions; decrypt is only for crypto-lifecycle)
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key_iam_member" "question_service_encrypt" {
  crypto_key_id = google_kms_crypto_key.question_encryption.id
  role          = "roles/cloudkms.cryptoKeyEncrypter"
  member        = "serviceAccount:${var.question_service_sa_email}"
}

# -----------------------------------------------------------------------------
# IAM: crypto-lifecycle also gets access to data-encryption-key for GCS
# -----------------------------------------------------------------------------
resource "google_kms_crypto_key_iam_member" "crypto_lifecycle_data_key" {
  crypto_key_id = google_kms_crypto_key.data_encryption.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${var.crypto_lifecycle_sa_email}"
}
