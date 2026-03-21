output "api_gateway_sa_email" {
  description = "API Gateway service account email"
  value       = google_service_account.api_gateway.email
}

output "question_service_sa_email" {
  description = "Question Service service account email"
  value       = google_service_account.question_service.email
}

output "paper_generator_sa_email" {
  description = "Paper Generator service account email"
  value       = google_service_account.paper_generator.email
}

output "crypto_lifecycle_sa_email" {
  description = "Crypto Lifecycle service account email"
  value       = google_service_account.crypto_lifecycle.email
}

output "collusion_engine_sa_email" {
  description = "Collusion Engine service account email"
  value       = google_service_account.collusion_engine.email
}

output "blockchain_service_sa_email" {
  description = "Blockchain Service service account email"
  value       = google_service_account.blockchain_service.email
}

output "exam_session_sa_email" {
  description = "Exam Session service account email"
  value       = google_service_account.exam_session.email
}

output "irt_calibrator_sa_email" {
  description = "IRT Calibrator worker service account email"
  value       = google_service_account.irt_calibrator.email
}

output "matrix_solver_sa_email" {
  description = "Matrix Solver worker service account email"
  value       = google_service_account.matrix_solver.email
}

output "collusion_detector_sa_email" {
  description = "Collusion Detector worker service account email"
  value       = google_service_account.collusion_detector.email
}

output "tlp_generator_sa_email" {
  description = "TLP Generator worker service account email"
  value       = google_service_account.tlp_generator.email
}

output "score_equator_sa_email" {
  description = "Score Equator worker service account email"
  value       = google_service_account.score_equator.email
}
