variable "project_id" {
  description = "GCP project ID"
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

variable "gke_cluster_id" {
  description = "GKE cluster ID - ensures Workload Identity pool exists before bindings"
  type        = string
  default     = ""
}
