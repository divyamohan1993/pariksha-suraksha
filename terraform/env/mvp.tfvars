project_id  = "lmsforshantithakur"
region      = "asia-south1"
environment = "mvp"
domain      = "pariksha.dmj.one"

notification_email = "divyamohan1993@gmail.com"

master_authorized_networks = [
  {
    cidr_block   = "0.0.0.0/0"
    display_name = "all-for-mvp"
  }
]

# ── Cost-optimized for GCP trial (<100 users, <$50/month) ──
# Single zone instead of regional (saves ~60%)
cluster_location = "asia-south1-a"

# General pool: e2-medium spot instances (2 vCPU, 4GB each)
general_machine_type = "e2-medium"
general_min_nodes    = 1
general_max_nodes    = 3
general_disk_size    = 30
general_disk_type    = "pd-standard"
use_spot_instances   = true

# Compute pool: e2-standard-2 spot (enough for MVP batch jobs)
compute_machine_type = "e2-standard-2"
compute_max_nodes    = 2
compute_disk_size    = 50

# Fabric pool: e2-small spot (1 node for all fabric pods)
fabric_machine_type = "e2-small"
fabric_min_nodes    = 1
fabric_max_nodes    = 2
fabric_disk_size    = 20

# Redis: Basic tier, 1GB (no HA for MVP)
redis_tier      = "BASIC"
redis_memory_gb = 1
