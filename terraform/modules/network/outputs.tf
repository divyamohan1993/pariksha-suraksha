output "network_id" {
  description = "VPC network self-link"
  value       = google_compute_network.pariksha.self_link
}

output "network_name" {
  description = "VPC network name"
  value       = google_compute_network.pariksha.name
}

output "subnet_id" {
  description = "Subnet self-link"
  value       = google_compute_subnetwork.pariksha.self_link
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.pariksha.name
}

output "pods_range_name" {
  description = "Name of the secondary IP range for pods"
  value       = "pods"
}

output "services_range_name" {
  description = "Name of the secondary IP range for services"
  value       = "services"
}

output "private_service_connection_id" {
  description = "Private service connection ID (for Redis dependency)"
  value       = google_service_networking_connection.private_service_connection.id
}
