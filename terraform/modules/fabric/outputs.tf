output "namespace" {
  description = "Fabric Kubernetes namespace"
  value       = kubernetes_namespace.fabric.metadata[0].name
}

output "crypto_config_name" {
  description = "Fabric crypto-config ConfigMap name"
  value       = kubernetes_config_map.crypto_config.metadata[0].name
}

output "configtx_name" {
  description = "Fabric configtx ConfigMap name"
  value       = kubernetes_config_map.configtx.metadata[0].name
}

output "pvc_names" {
  description = "Map of Fabric PVC names"
  value       = { for k, v in kubernetes_persistent_volume_claim.fabric : k => v.metadata[0].name }
}
