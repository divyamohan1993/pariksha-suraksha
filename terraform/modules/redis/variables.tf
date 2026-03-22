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

variable "redis_tier" {
  type    = string
  default = "STANDARD_HA"
}

variable "redis_memory_gb" {
  type    = number
  default = 5
}
