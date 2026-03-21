output "redis_host" {
  description = "Redis instance host IP"
  value       = google_redis_instance.pariksha.host
}

output "redis_port" {
  description = "Redis instance port"
  value       = google_redis_instance.pariksha.port
}

output "redis_auth_string" {
  description = "Redis AUTH string"
  value       = google_redis_instance.pariksha.auth_string
  sensitive   = true
}

output "redis_instance_id" {
  description = "Redis instance ID"
  value       = google_redis_instance.pariksha.id
}
