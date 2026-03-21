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

variable "network_id" {
  description = "VPC network self-link for private service access"
  type        = string
}
