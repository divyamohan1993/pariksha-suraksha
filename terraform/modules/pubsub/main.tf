###############################################################################
# Pub/Sub Module — Topics & Subscriptions for Worker Triggers
###############################################################################

locals {
  topics = [
    "irt-calibration-trigger",
    "matrix-solver-trigger",
    "collusion-detection-trigger",
    "tlp-generation-trigger",
    "score-equation-trigger",
  ]
}

# -----------------------------------------------------------------------------
# Dead Letter Topics (one per worker topic)
# -----------------------------------------------------------------------------
resource "google_pubsub_topic" "dead_letter" {
  for_each = toset(local.topics)

  name    = "${each.value}-dlq-${var.environment}"
  project = var.project_id
  labels  = var.labels

  message_retention_duration = "604800s" # 7 days
}

# -----------------------------------------------------------------------------
# Worker Trigger Topics
# -----------------------------------------------------------------------------
resource "google_pubsub_topic" "worker_triggers" {
  for_each = toset(local.topics)

  name    = "${each.value}-${var.environment}"
  project = var.project_id
  labels  = var.labels

  message_retention_duration = "604800s" # 7 days

  message_storage_policy {
    allowed_persistence_regions = ["asia-south1"]
  }
}

# -----------------------------------------------------------------------------
# Subscriptions with Dead Letter Policy
# -----------------------------------------------------------------------------
resource "google_pubsub_subscription" "worker_subscriptions" {
  for_each = toset(local.topics)

  name    = "${each.value}-sub-${var.environment}"
  project = var.project_id
  topic   = google_pubsub_topic.worker_triggers[each.key].id
  labels  = var.labels

  ack_deadline_seconds       = 600 # 10 minutes for long-running workers
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false

  expiration_policy {
    ttl = "" # Never expire
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter[each.key].id
    max_delivery_attempts = 5
  }

  enable_exactly_once_delivery = true
}

# -----------------------------------------------------------------------------
# Dead Letter Subscriptions (for monitoring/alerting)
# -----------------------------------------------------------------------------
resource "google_pubsub_subscription" "dead_letter_subscriptions" {
  for_each = toset(local.topics)

  name    = "${each.value}-dlq-sub-${var.environment}"
  project = var.project_id
  topic   = google_pubsub_topic.dead_letter[each.key].id
  labels  = var.labels

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s" # 7 days

  expiration_policy {
    ttl = "" # Never expire
  }
}
