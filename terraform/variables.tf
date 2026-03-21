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
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be either 'dev' or 'prod'."
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
