project_id         = "pariksha-suraksha-dev"
region             = "asia-south1"
environment        = "dev"
domain             = "dev.pariksha.dmj.one"
notification_email = "dev-alerts@pariksha.dmj.one"

master_authorized_networks = [
  {
    cidr_block   = "0.0.0.0/0"
    display_name = "Allow all (dev only)"
  }
]
