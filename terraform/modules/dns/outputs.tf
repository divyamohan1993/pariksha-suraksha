output "zone_name" {
  description = "Cloud DNS managed zone name"
  value       = google_dns_managed_zone.pariksha.name
}

output "name_servers" {
  description = "Cloud DNS name servers"
  value       = google_dns_managed_zone.pariksha.name_servers
}

output "ingress_ip" {
  description = "Static IP address for GKE ingress"
  value       = google_compute_global_address.ingress_ip.address
}
