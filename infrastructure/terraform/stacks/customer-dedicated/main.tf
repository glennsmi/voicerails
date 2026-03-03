terraform {
  required_version = ">= 1.6.0"
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west2"
}

variable "control_plane_url" {
  type    = string
  default = "https://api.voicerails.dev"
}

output "runtime_region" {
  value = var.region
}
