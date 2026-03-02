terraform {
  required_version = ">= 1.6.0"
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

output "project_id" {
  value = var.project_id
}
