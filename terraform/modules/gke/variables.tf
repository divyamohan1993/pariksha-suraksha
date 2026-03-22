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
  description = "VPC network self-link"
  type        = string
}

variable "subnet_id" {
  description = "Subnet self-link"
  type        = string
}

variable "pods_range_name" {
  description = "Name of the secondary IP range for pods"
  type        = string
}

variable "services_range_name" {
  description = "Name of the secondary IP range for services"
  type        = string
}

variable "master_authorized_networks" {
  description = "CIDR blocks authorized to access the GKE master"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

variable "cluster_location" {
  description = "Cluster location (region for HA, zone for cost savings)"
  type        = string
}

variable "general_machine_type" {
  description = "Machine type for general node pool"
  type        = string
  default     = "e2-standard-4"
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
