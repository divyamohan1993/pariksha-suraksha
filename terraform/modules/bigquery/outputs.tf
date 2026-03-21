output "dataset_id" {
  description = "BigQuery dataset ID"
  value       = google_bigquery_dataset.pariksha_analytics.dataset_id
}

output "field_test_responses_table_id" {
  description = "Field test responses table ID"
  value       = google_bigquery_table.field_test_responses.table_id
}

output "irt_parameters_table_id" {
  description = "IRT parameters table ID"
  value       = google_bigquery_table.irt_parameters.table_id
}

output "distractor_profiles_table_id" {
  description = "Distractor profiles table ID"
  value       = google_bigquery_table.distractor_profiles.table_id
}

output "exam_results_table_id" {
  description = "Exam results table ID"
  value       = google_bigquery_table.exam_results.table_id
}

output "collusion_scores_table_id" {
  description = "Collusion scores table ID"
  value       = google_bigquery_table.collusion_scores.table_id
}
