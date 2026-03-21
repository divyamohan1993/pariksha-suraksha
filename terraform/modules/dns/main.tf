###############################################################################
# DNS Module — Cloud DNS Managed Zone & Records
###############################################################################

resource "google_dns_managed_zone" "pariksha" {
  name        = "pariksha-zone-${var.environment}"
  project     = var.project_id
  dns_name    = "${var.domain}."
  description = "ParikshaSuraksha DNS zone (${var.environment})"
  visibility  = "public"

  labels = var.labels

  dnssec_config {
    state = "on"
  }
}

# -----------------------------------------------------------------------------
# Reserve a global static IP for the GKE ingress
# -----------------------------------------------------------------------------
resource "google_compute_global_address" "ingress_ip" {
  name    = "pariksha-ingress-ip-${var.environment}"
  project = var.project_id
}

# -----------------------------------------------------------------------------
# A record pointing to GKE ingress IP
# -----------------------------------------------------------------------------
resource "google_dns_record_set" "root" {
  name         = "${var.domain}."
  project      = var.project_id
  managed_zone = google_dns_managed_zone.pariksha.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.ingress_ip.address]
}

# Wildcard A record for subdomains (api.pariksha.dmj.one, admin.pariksha.dmj.one, etc.)
resource "google_dns_record_set" "wildcard" {
  name         = "*.${var.domain}."
  project      = var.project_id
  managed_zone = google_dns_managed_zone.pariksha.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.ingress_ip.address]
}
