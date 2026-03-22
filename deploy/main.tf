# ParikshaSuraksha — One-Click VM Deploy/Destroy
# Usage:
#   terraform init
#   terraform apply              # Creates VM, installs everything, starts services
#   terraform destroy             # Deletes VM and all resources

terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  default = "lmsforshantithakur"
}

variable "region" {
  default = "asia-south1"
}

variable "zone" {
  default = "asia-south1-a"
}

variable "machine_type" {
  description = "VM size. Use c2-standard-4 for fast builds, e2-small after setup to save costs."
  default     = "e2-medium"
}

variable "spot" {
  description = "Use spot instance (60-70% cheaper, may be preempted)"
  default     = true
}

variable "gemini_api_key" {
  description = "Gemini API key for AI question generation. Get from: gcloud services api-keys create"
  sensitive   = true
  default     = ""
}

# Firewall rule
resource "google_compute_firewall" "pariksha_http" {
  name    = "pariksha-allow-http"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["pariksha"]
}

# VM
resource "google_compute_instance" "pariksha" {
  name         = "pariksha-vm"
  machine_type = var.machine_type
  zone         = var.zone

  scheduling {
    preemptible                 = var.spot
    automatic_restart           = !var.spot
    provisioning_model          = var.spot ? "SPOT" : "STANDARD"
    instance_termination_action = var.spot ? "STOP" : null
  }

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
    }
  }

  network_interface {
    network = "default"
    access_config {} # Public IP
  }

  tags = ["pariksha"]

  metadata = {
    startup-script = templatefile("${path.module}/startup.sh", {
      gemini_api_key = var.gemini_api_key
    })
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  labels = {
    app = "pariksha-suraksha"
  }
}

output "url" {
  value = "http://${google_compute_instance.pariksha.network_interface[0].access_config[0].nat_ip}"
}

output "ip" {
  value = google_compute_instance.pariksha.network_interface[0].access_config[0].nat_ip
}

output "ssh" {
  value = "gcloud compute ssh pariksha-vm --zone=${var.zone} --project=${var.project_id}"
}

output "admin" {
  value = "http://${google_compute_instance.pariksha.network_interface[0].access_config[0].nat_ip}/admin/dashboard"
}

output "about" {
  value = "http://${google_compute_instance.pariksha.network_interface[0].access_config[0].nat_ip}/about"
}

output "pitch" {
  value = "http://${google_compute_instance.pariksha.network_interface[0].access_config[0].nat_ip}/pitch"
}
