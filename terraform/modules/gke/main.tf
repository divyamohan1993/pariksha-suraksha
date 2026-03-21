###############################################################################
# GKE Module — Cluster, Node Pools, Workload Identity
###############################################################################

resource "google_container_cluster" "pariksha" {
  provider = google-beta

  name     = "pariksha-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  location = var.region

  # Use separately managed node pools
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = var.network_id
  subnetwork = var.subnet_id

  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Network policy (Calico)
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  addons_config {
    network_policy_config {
      disabled = false
    }
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
  }

  # Shielded nodes
  node_config {
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }

  # Binary authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Logging and monitoring
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }

  # Maintenance window (Sunday 2 AM IST = Saturday 8:30 PM UTC)
  maintenance_policy {
    recurring_window {
      start_time = "2026-01-01T20:30:00Z"
      end_time   = "2026-01-02T04:30:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SA"
    }
  }

  resource_labels = var.labels

  # Prevent accidental destruction in prod
  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Node Pool: General (API services, web frontends)
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "general" {
  name     = "general"
  project  = var.project_id
  location = var.region
  cluster  = google_container_cluster.pariksha.name

  initial_node_count = 2

  autoscaling {
    min_node_count = 2
    max_node_count = 10
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = "e2-standard-4"
    disk_size_gb = 100
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = merge(var.labels, {
      node_pool = "general"
    })

    metadata = {
      disable-legacy-endpoints = "true"
    }

    tags = ["pariksha-gke-node", "general"]
  }
}

# -----------------------------------------------------------------------------
# Node Pool: Compute (Python workers — matrix solver, IRT calibration)
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "compute" {
  name     = "compute"
  project  = var.project_id
  location = var.region
  cluster  = google_container_cluster.pariksha.name

  initial_node_count = 0

  autoscaling {
    min_node_count = 0
    max_node_count = 5
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = "c2-standard-8"
    disk_size_gb = 200
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    taint {
      key    = "workload"
      value  = "compute"
      effect = "NO_SCHEDULE"
    }

    labels = merge(var.labels, {
      node_pool = "compute"
    })

    metadata = {
      disable-legacy-endpoints = "true"
    }

    tags = ["pariksha-gke-node", "compute"]
  }
}

# -----------------------------------------------------------------------------
# Node Pool: Fabric (Hyperledger Fabric peers and orderers)
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "fabric" {
  name     = "fabric"
  project  = var.project_id
  location = var.region
  cluster  = google_container_cluster.pariksha.name

  initial_node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 5
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = "e2-standard-4"
    disk_size_gb = 200
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    taint {
      key    = "workload"
      value  = "fabric"
      effect = "NO_SCHEDULE"
    }

    labels = merge(var.labels, {
      node_pool = "fabric"
    })

    metadata = {
      disable-legacy-endpoints = "true"
    }

    tags = ["pariksha-gke-node", "fabric"]
  }
}
