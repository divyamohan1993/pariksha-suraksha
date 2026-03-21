###############################################################################
# Network Module — VPC, Subnets, Cloud NAT, Firewall Rules
###############################################################################

resource "google_compute_network" "pariksha" {
  name                    = "pariksha-vpc-${var.environment}-${var.name_suffix}"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "pariksha" {
  name                     = "pariksha-subnet-${var.environment}-${var.name_suffix}"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.pariksha.id
  ip_cidr_range            = "10.0.0.0/20"
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.4.0.0/14"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.8.0.0/20"
  }

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# -----------------------------------------------------------------------------
# Cloud NAT for egress traffic from private GKE nodes
# -----------------------------------------------------------------------------
resource "google_compute_router" "pariksha" {
  name    = "pariksha-router-${var.environment}-${var.name_suffix}"
  project = var.project_id
  region  = var.region
  network = google_compute_network.pariksha.id
}

resource "google_compute_router_nat" "pariksha" {
  name                               = "pariksha-nat-${var.environment}-${var.name_suffix}"
  project                            = var.project_id
  region                             = var.region
  router                             = google_compute_router.pariksha.name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# -----------------------------------------------------------------------------
# Firewall Rules
# -----------------------------------------------------------------------------

# Deny all ingress by default
resource "google_compute_firewall" "deny_all_ingress" {
  name     = "pariksha-deny-all-ingress-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  network  = google_compute_network.pariksha.id
  priority = 65534

  deny {
    protocol = "all"
  }

  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
}

# Allow internal communication within the VPC (GKE node-to-node, pod-to-pod)
resource "google_compute_firewall" "allow_internal" {
  name     = "pariksha-allow-internal-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  network  = google_compute_network.pariksha.id
  priority = 1000

  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "udp"
  }
  allow {
    protocol = "icmp"
  }

  direction     = "INGRESS"
  source_ranges = ["10.0.0.0/8"]
}

# Allow GCP health check probes
resource "google_compute_firewall" "allow_health_checks" {
  name     = "pariksha-allow-health-checks-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  network  = google_compute_network.pariksha.id
  priority = 900

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080", "10256"]
  }

  direction = "INGRESS"
  # GCP health check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22",
    "209.85.152.0/22",
    "209.85.204.0/22",
  ]
}

# Allow GKE master to node communication (for webhooks, kubelet)
resource "google_compute_firewall" "allow_master_to_node" {
  name     = "pariksha-allow-master-${var.environment}-${var.name_suffix}"
  project  = var.project_id
  network  = google_compute_network.pariksha.id
  priority = 800

  allow {
    protocol = "tcp"
    ports    = ["443", "10250", "8443"]
  }

  direction     = "INGRESS"
  source_ranges = ["172.16.0.0/28"] # GKE master CIDR
}

# -----------------------------------------------------------------------------
# Private Service Access (for Memorystore Redis)
# -----------------------------------------------------------------------------
resource "google_compute_global_address" "private_service_range" {
  name          = "pariksha-private-svc-${var.environment}-${var.name_suffix}"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.pariksha.id
}

resource "google_service_networking_connection" "private_service_connection" {
  network                 = google_compute_network.pariksha.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
}
