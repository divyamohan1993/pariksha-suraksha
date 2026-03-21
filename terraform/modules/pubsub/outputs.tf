output "topic_ids" {
  description = "Map of topic names to their IDs"
  value       = { for k, v in google_pubsub_topic.worker_triggers : k => v.id }
}

output "subscription_ids" {
  description = "Map of subscription names to their IDs"
  value       = { for k, v in google_pubsub_subscription.worker_subscriptions : k => v.id }
}

output "dead_letter_topic_ids" {
  description = "Map of dead letter topic names to their IDs"
  value       = { for k, v in google_pubsub_topic.dead_letter : k => v.id }
}
