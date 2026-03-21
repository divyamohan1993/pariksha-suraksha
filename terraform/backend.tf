terraform {
  backend "gcs" {
    bucket = "pariksha-terraform-state"
    prefix = "terraform/state"
  }
}
