output "gke_cluster_endpoint" {
  description = "GKE cluster API server endpoint"
  value       = module.gke.cluster_endpoint
  sensitive   = true
}

output "gke_cluster_ca_certificate" {
  description = "GKE cluster CA certificate (base64-encoded)"
  value       = module.gke.cluster_ca_certificate
  sensitive   = true
}

output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = module.gke.cluster_name
}

output "redis_host" {
  description = "Memorystore Redis instance host IP"
  value       = module.redis.redis_host
}

output "redis_port" {
  description = "Memorystore Redis instance port"
  value       = module.redis.redis_port
}

output "firestore_database" {
  description = "Firestore database name"
  value       = module.firestore.database_name
}

output "kms_key_ring" {
  description = "KMS key ring resource name"
  value       = module.kms.key_ring_id
}

output "kms_question_encryption_key" {
  description = "KMS question encryption key resource name"
  value       = module.kms.question_encryption_key_id
}

output "kms_data_encryption_key" {
  description = "KMS data encryption key resource name"
  value       = module.kms.data_encryption_key_id
}

output "gcs_encrypted_questions_bucket" {
  description = "GCS bucket for encrypted question blobs"
  value       = module.storage.encrypted_questions_bucket
}

output "gcs_field_test_data_bucket" {
  description = "GCS bucket for field test data"
  value       = module.storage.field_test_data_bucket
}

output "gcs_backups_bucket" {
  description = "GCS bucket for backups"
  value       = module.storage.backups_bucket
}

output "gcs_reports_bucket" {
  description = "GCS bucket for reports"
  value       = module.storage.reports_bucket
}

output "bigquery_dataset_id" {
  description = "BigQuery analytics dataset ID"
  value       = module.bigquery.dataset_id
}

output "dns_zone_name" {
  description = "Cloud DNS managed zone name"
  value       = module.dns.zone_name
}

output "dns_name_servers" {
  description = "Cloud DNS zone name servers"
  value       = module.dns.name_servers
}

output "network_id" {
  description = "VPC network self-link"
  value       = module.network.network_id
}

output "subnet_id" {
  description = "Subnet self-link"
  value       = module.network.subnet_id
}
