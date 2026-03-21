output "key_ring_id" {
  description = "KMS key ring resource name"
  value       = google_kms_key_ring.pariksha.id
}

output "question_encryption_key_id" {
  description = "KMS question encryption crypto key resource name"
  value       = google_kms_crypto_key.question_encryption.id
}

output "data_encryption_key_id" {
  description = "KMS data encryption crypto key resource name"
  value       = google_kms_crypto_key.data_encryption.id
}
