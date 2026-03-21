###############################################################################
# Redis Module — Memorystore for Redis 7.x
###############################################################################

resource "google_redis_instance" "pariksha" {
  name           = "pariksha-redis-${var.environment}-${var.name_suffix}"
  project        = var.project_id
  region         = var.region
  tier           = "STANDARD_HA"
  memory_size_gb = 5
  redis_version  = "REDIS_7_2"

  authorized_network = var.network_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  redis_configs = {
    # Redis 7.x ACL users for service-level access control
    # paper-generator: read-only access to paper keys
    # exam-session: read/write checkpoint keys
    # crypto-lifecycle: write-only decrypted papers during pre-warm
    maxmemory-policy  = "allkeys-lru"
    notify-keyspace-events = ""
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = false
  }
}
