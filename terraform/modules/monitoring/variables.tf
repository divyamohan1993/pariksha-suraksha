variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "domain" {
  description = "Domain name for uptime checks"
  type        = string
}

variable "notification_email" {
  description = "Email for alert notifications"
  type        = string
}

variable "labels" {
  description = "Common resource labels"
  type        = map(string)
}
