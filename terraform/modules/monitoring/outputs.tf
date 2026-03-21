output "notification_channel_id" {
  description = "Monitoring notification channel ID"
  value       = google_monitoring_notification_channel.email.id
}

output "dashboard_id" {
  description = "Exam day operations dashboard ID"
  value       = google_monitoring_dashboard.exam_day.id
}

output "alert_policy_ids" {
  description = "Alert policy IDs"
  value = {
    key_release_deviation  = google_monitoring_alert_policy.key_release_deviation.id
    paper_gen_latency      = google_monitoring_alert_policy.paper_gen_latency.id
    fabric_peer_disconnect = google_monitoring_alert_policy.fabric_peer_disconnect.id
    unauthorized_kms       = google_monitoring_alert_policy.unauthorized_kms_access.id
  }
}
