###############################################################################
# ParikshaSuraksha — Root Terraform Module
# One-click deploy/destroy for the complete exam integrity infrastructure
###############################################################################

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Random suffix for globally unique resource names
# -----------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_suffix      = random_id.suffix.hex
  cluster_location = var.cluster_location != "" ? var.cluster_location : var.region
  common_labels = {
    environment = var.environment
    project     = "pariksha-suraksha"
    managed_by  = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Kubernetes & Helm providers (configured after GKE is created)
# -----------------------------------------------------------------------------
provider "kubernetes" {
  host                   = "https://${module.gke.cluster_endpoint}"
  cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
  token                  = data.google_client_config.default.access_token
}

provider "helm" {
  kubernetes {
    host                   = "https://${module.gke.cluster_endpoint}"
    cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
    token                  = data.google_client_config.default.access_token
  }
}

data "google_client_config" "default" {}

# -----------------------------------------------------------------------------
# Module: Network (VPC, Subnets, Cloud NAT, Firewall)
# -----------------------------------------------------------------------------
module "network" {
  source = "./modules/network"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name_suffix = local.name_suffix
  labels      = local.common_labels
}

# -----------------------------------------------------------------------------
# Module: IAM (Service Accounts, Workload Identity Bindings)
# -----------------------------------------------------------------------------
module "iam" {
  source = "./modules/iam"

  project_id     = var.project_id
  environment    = var.environment
  name_suffix    = local.name_suffix
  labels         = local.common_labels
  gke_cluster_id = module.gke.cluster_name

  depends_on = [module.gke]
}

# -----------------------------------------------------------------------------
# Module: KMS (Key Rings, Crypto Keys)
# -----------------------------------------------------------------------------
module "kms" {
  source = "./modules/kms"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name_suffix = local.name_suffix
  labels      = local.common_labels

  crypto_lifecycle_sa_email = module.iam.crypto_lifecycle_sa_email
  question_service_sa_email = module.iam.question_service_sa_email

  depends_on = [module.iam, module.gke]
}

# -----------------------------------------------------------------------------
# Module: GKE (Cluster, Node Pools, Workload Identity)
# -----------------------------------------------------------------------------
module "gke" {
  source = "./modules/gke"

  project_id                 = var.project_id
  region                     = var.region
  environment                = var.environment
  name_suffix                = local.name_suffix
  labels                     = local.common_labels
  network_id                 = module.network.network_id
  subnet_id                  = module.network.subnet_id
  pods_range_name            = module.network.pods_range_name
  services_range_name        = module.network.services_range_name
  master_authorized_networks = var.master_authorized_networks

  # Configurable sizing (MVP uses smaller instances)
  cluster_location     = local.cluster_location
  general_machine_type = var.general_machine_type
  general_min_nodes    = var.general_min_nodes
  general_max_nodes    = var.general_max_nodes
  general_disk_size    = var.general_disk_size
  general_disk_type    = var.general_disk_type
  use_spot_instances   = var.use_spot_instances
  compute_machine_type = var.compute_machine_type
  compute_max_nodes    = var.compute_max_nodes
  compute_disk_size    = var.compute_disk_size
  fabric_machine_type  = var.fabric_machine_type
  fabric_min_nodes     = var.fabric_min_nodes
  fabric_max_nodes     = var.fabric_max_nodes
  fabric_disk_size     = var.fabric_disk_size

  depends_on = [module.network]
}

# -----------------------------------------------------------------------------
# Module: Storage (GCS Buckets)
# -----------------------------------------------------------------------------
module "storage" {
  source = "./modules/storage"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name_suffix = local.name_suffix
  labels      = local.common_labels
  kms_key_id  = module.kms.data_encryption_key_id

  depends_on = [module.kms]
}

# -----------------------------------------------------------------------------
# Module: Firestore
# -----------------------------------------------------------------------------
module "firestore" {
  source = "./modules/firestore"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  labels      = local.common_labels
}

# -----------------------------------------------------------------------------
# Module: Redis (Memorystore)
# -----------------------------------------------------------------------------
module "redis" {
  source = "./modules/redis"

  project_id      = var.project_id
  region          = var.region
  environment     = var.environment
  name_suffix     = local.name_suffix
  labels          = local.common_labels
  network_id      = module.network.network_id
  redis_tier      = var.redis_tier
  redis_memory_gb = var.redis_memory_gb

  depends_on = [module.network]
}

# -----------------------------------------------------------------------------
# Module: BigQuery (Analytics Dataset & Tables)
# -----------------------------------------------------------------------------
module "bigquery" {
  source = "./modules/bigquery"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  labels      = local.common_labels
}

# -----------------------------------------------------------------------------
# Module: Pub/Sub (Topics & Subscriptions for Workers)
# -----------------------------------------------------------------------------
module "pubsub" {
  source = "./modules/pubsub"

  project_id  = var.project_id
  environment = var.environment
  labels      = local.common_labels
}

# -----------------------------------------------------------------------------
# Module: DNS (Cloud DNS Zone & Records)
# -----------------------------------------------------------------------------
module "dns" {
  source = "./modules/dns"

  project_id  = var.project_id
  environment = var.environment
  domain      = var.domain
  labels      = local.common_labels
}

# -----------------------------------------------------------------------------
# Module: Monitoring (Uptime Checks, Alerts, Dashboards)
# -----------------------------------------------------------------------------
module "monitoring" {
  source = "./modules/monitoring"

  project_id         = var.project_id
  environment        = var.environment
  domain             = var.domain
  notification_email = var.notification_email
  labels             = local.common_labels

  depends_on = [module.gke]
}

# -----------------------------------------------------------------------------
# Module: Fabric (GKE Namespace, PVCs for Hyperledger Fabric)
# -----------------------------------------------------------------------------
module "fabric" {
  source = "./modules/fabric"

  environment = var.environment
  labels      = local.common_labels

  depends_on = [module.gke]
}
