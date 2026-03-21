###############################################################################
# Monitoring Module — Uptime Checks, Alert Policies, Dashboards
###############################################################################

# -----------------------------------------------------------------------------
# Notification Channel (Email)
# -----------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "email" {
  display_name = "ParikshaSuraksha Alerts (${var.environment})"
  project      = var.project_id
  type         = "email"

  labels = {
    email_address = var.notification_email
  }

  user_labels = var.labels
}

# -----------------------------------------------------------------------------
# Uptime Checks for All Services
# -----------------------------------------------------------------------------
locals {
  uptime_checks = {
    "api-gateway"       = "/healthz"
    "question-service"  = "/healthz"
    "paper-generator"   = "/healthz"
    "crypto-lifecycle"  = "/healthz"
    "collusion-engine"  = "/healthz"
    "blockchain-svc"    = "/healthz"
    "exam-session"      = "/healthz"
    "admin-dashboard"   = "/"
    "candidate-portal"  = "/"
    "exam-terminal"     = "/"
  }
}

resource "google_monitoring_uptime_check_config" "services" {
  for_each = local.uptime_checks

  display_name = "pariksha-${each.key}-${var.environment}"
  project      = var.project_id
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = each.value
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain
    }
  }

  user_labels = var.labels
}

# -----------------------------------------------------------------------------
# Alert Policy: Key Release Deviation > 5s (P0)
# -----------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "key_release_deviation" {
  display_name = "[P0] Key Release Deviation > 5s (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Key release timing deviation exceeds 5 seconds"

    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/key_release_deviation_seconds\" AND resource.label.\"namespace_name\"=\"pariksha-api\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5.0
      duration        = "0s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  user_labels = merge(var.labels, {
    severity = "p0"
    category = "security"
  })

  documentation {
    content   = "Key release deviation from scheduled time exceeds 5 seconds. This is a P0 security incident — exam keys may be released early or late. Investigate crypto-lifecycle service immediately."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Alert Policy: Paper Generation Latency > 100ms (P1)
# -----------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "paper_gen_latency" {
  display_name = "[P1] Paper Generation Latency > 100ms (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Paper generation latency exceeds 100ms"

    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/paper_generation_latency_ms\" AND resource.label.\"namespace_name\"=\"pariksha-api\""
      comparison      = "COMPARISON_GT"
      threshold_value = 100.0
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
  }

  user_labels = merge(var.labels, {
    severity = "p1"
    category = "performance"
  })

  documentation {
    content   = "Paper generation p99 latency exceeds 100ms for 5 minutes. The O(1) hot path may be degraded. Check Redis connectivity and cached paper availability."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Alert Policy: Fabric Peer Disconnect (P1)
# -----------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "fabric_peer_disconnect" {
  display_name = "[P1] Fabric Peer Disconnect (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Hyperledger Fabric peer disconnected"

    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND metric.type=\"kubernetes.io/container/restart_count\" AND resource.label.\"namespace_name\"=\"pariksha-fabric\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.pod_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
  }

  user_labels = merge(var.labels, {
    severity = "p1"
    category = "infrastructure"
  })

  documentation {
    content   = "A Hyperledger Fabric peer or orderer pod has restarted. Check the pariksha-fabric namespace for crashlooping pods. Audit trail integrity may be affected."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Alert Policy: Unauthorized KMS Access (P0)
# -----------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "unauthorized_kms_access" {
  display_name = "[P0] Unauthorized KMS Access Attempt (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Unauthorized KMS key access attempt detected"

    condition_threshold {
      filter          = "resource.type=\"audited_resource\" AND metric.type=\"logging.googleapis.com/user/pariksha_unauthorized_kms_access\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_COUNT"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }

  user_labels = merge(var.labels, {
    severity = "p0"
    category = "security"
  })

  documentation {
    content   = "An unauthorized attempt to access KMS crypto keys was detected. This is a P0 security incident. Investigate the source immediately. Check Cloud Audit Logs for the denied request details."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Log-based Metric for Unauthorized KMS Access
# -----------------------------------------------------------------------------
resource "google_logging_metric" "unauthorized_kms_access" {
  name    = "pariksha_unauthorized_kms_access"
  project = var.project_id
  filter  = <<-EOT
    resource.type="audited_resource"
    AND protoPayload.serviceName="cloudkms.googleapis.com"
    AND protoPayload.status.code!=0
    AND protoPayload.methodName=~"Encrypt|Decrypt"
    AND protoPayload.resourceName=~"pariksha-keyring"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    display_name = "Unauthorized KMS Access Attempts"
  }
}

# -----------------------------------------------------------------------------
# Dashboard: Exam Day Operations
# -----------------------------------------------------------------------------
resource "google_monitoring_dashboard" "exam_day" {
  dashboard_json = jsonencode({
    displayName = "ParikshaSuraksha Exam Day Operations (${var.environment})"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Paper Generation Latency (p50, p95, p99)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/paper_generation_latency_ms\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_50"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "p50"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/paper_generation_latency_ms\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_95"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "p95"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/paper_generation_latency_ms\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_99"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "p99"
                }
              ]
              yAxis = {
                label = "Latency (ms)"
              }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Key Release Timing Deviation"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/key_release_deviation_seconds\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_MAX"
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "Deviation (seconds)"
              }
            }
          }
        },
        {
          xPos   = 0
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Blockchain Event Recording Rate"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/blockchain_events_total\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_RATE"
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "Events/sec"
              }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Candidate Throughput (Active Sessions)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/active_exam_sessions\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_MEAN"
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "Active Sessions"
              }
            }
          }
        },
        {
          xPos   = 0
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "GKE Node CPU Utilization"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_node\" AND metric.type=\"kubernetes.io/node/cpu/allocatable_utilization\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_MEAN"
                        crossSeriesReducer = "REDUCE_MEAN"
                        groupByFields      = ["metadata.user_labels.\"node_pool\""]
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "CPU Utilization"
              }
            }
          }
        },
        {
          xPos   = 4
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "Redis Memory Usage"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/stats/memory/usage\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_MEAN"
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "Memory (bytes)"
              }
            }
          }
        },
        {
          xPos   = 8
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "Service Error Rates"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/pariksha/http_errors_total\" AND resource.label.\"namespace_name\"=\"pariksha-api\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_SUM"
                        groupByFields      = ["resource.label.container_name"]
                      }
                    }
                  }
                  plotType = "LINE"
                }
              ]
              yAxis = {
                label = "Errors/sec"
              }
            }
          }
        }
      ]
    }
  })
  project = var.project_id
}
