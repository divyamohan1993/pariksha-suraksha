project_id         = "pariksha-suraksha-prod"
region             = "asia-south1"
environment        = "prod"
domain             = "pariksha.dmj.one"
notification_email = "alerts@pariksha.dmj.one"

master_authorized_networks = [
  {
    cidr_block   = "10.0.0.0/8"
    display_name = "Internal VPC"
  }
]
