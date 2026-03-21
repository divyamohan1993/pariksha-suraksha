output "encrypted_questions_bucket" {
  description = "Encrypted questions GCS bucket name"
  value       = google_storage_bucket.encrypted_questions.name
}

output "field_test_data_bucket" {
  description = "Field test data GCS bucket name"
  value       = google_storage_bucket.field_test_data.name
}

output "backups_bucket" {
  description = "Backups GCS bucket name"
  value       = google_storage_bucket.backups.name
}

output "reports_bucket" {
  description = "Reports GCS bucket name"
  value       = google_storage_bucket.reports.name
}
