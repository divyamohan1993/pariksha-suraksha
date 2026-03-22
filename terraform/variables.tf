variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resource deployment"
  type        = string
  default     = "asia-south1"
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod", "mvp"], var.environment)
    error_message = "Environment must be 'dev', 'prod', or 'mvp'."
  }
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "pariksha.dmj.one"
}

variable "notification_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
  default     = "alerts@pariksha.dmj.one"
}

# GKE sizing variables (defaults = prod, override in tfvars for MVP)
variable "cluster_location" {
  description = "Cluster location (region for HA, zone for cost savings)"
  type        = string
  default     = ""  # empty = use var.region
}

variable "general_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "general_min_nodes" {
  type    = number
  default = 2
}

variable "general_max_nodes" {
  type    = number
  default = 10
}

variable "general_disk_size" {
  type    = number
  default = 100
}

variable "general_disk_type" {
  type    = string
  default = "pd-ssd"
}

variable "use_spot_instances" {
  type    = bool
  default = false
}

variable "compute_machine_type" {
  type    = string
  default = "c2-standard-8"
}

variable "compute_max_nodes" {
  type    = number
  default = 5
}

variable "compute_disk_size" {
  type    = number
  default = 200
}

variable "fabric_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "fabric_min_nodes" {
  type    = number
  default = 3
}

variable "fabric_max_nodes" {
  type    = number
  default = 5
}

variable "fabric_disk_size" {
  type    = number
  default = 200
}

# Redis sizing
variable "redis_tier" {
  type    = string
  default = "STANDARD_HA"
}

variable "redis_memory_gb" {
  type    = number
  default = 5
}

variable "master_authorized_networks" {
  description = "CIDR blocks authorized to access the GKE master endpoint"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = [
    {
      cidr_block   = "10.0.0.0/8"
      display_name = "Internal VPC"
    }
  ]
}
