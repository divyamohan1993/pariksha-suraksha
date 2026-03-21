variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "name_suffix" {
  description = "Random suffix for unique naming"
  type        = string
}

variable "labels" {
  description = "Common resource labels"
  type        = map(string)
}

variable "crypto_lifecycle_sa_email" {
  description = "Service account email for crypto-lifecycle service"
  type        = string
}

variable "question_service_sa_email" {
  description = "Service account email for question-service"
  type        = string
}
