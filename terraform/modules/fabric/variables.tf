variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "labels" {
  description = "Common resource labels"
  type        = map(string)
}
