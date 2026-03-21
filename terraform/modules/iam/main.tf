###############################################################################
# IAM Module — Service Accounts, Workload Identity, Least-Privilege Bindings
# No service account keys — all Workload Identity
###############################################################################

locals {
  k8s_namespace_api     = "pariksha-api"
  k8s_namespace_workers = "pariksha-workers"
  k8s_namespace_fabric  = "pariksha-fabric"
  k8s_namespace_web     = "pariksha-web"
}

# =============================================================================
# Service Accounts for each microservice
# =============================================================================

# --- API Gateway ---
resource "google_service_account" "api_gateway" {
  account_id   = "pariksha-api-gw-${var.environment}"
  display_name = "ParikshaSuraksha API Gateway (${var.environment})"
  project      = var.project_id
}

# --- Question Service ---
resource "google_service_account" "question_service" {
  account_id   = "pariksha-question-${var.environment}"
  display_name = "ParikshaSuraksha Question Service (${var.environment})"
  project      = var.project_id
}

# --- Paper Generator ---
resource "google_service_account" "paper_generator" {
  account_id   = "pariksha-paper-gen-${var.environment}"
  display_name = "ParikshaSuraksha Paper Generator (${var.environment})"
  project      = var.project_id
}

# --- Crypto Lifecycle ---
resource "google_service_account" "crypto_lifecycle" {
  account_id   = "pariksha-crypto-${var.environment}"
  display_name = "ParikshaSuraksha Crypto Lifecycle (${var.environment})"
  project      = var.project_id
}

# --- Collusion Engine ---
resource "google_service_account" "collusion_engine" {
  account_id   = "pariksha-collusion-${var.environment}"
  display_name = "ParikshaSuraksha Collusion Engine (${var.environment})"
  project      = var.project_id
}

# --- Blockchain Service ---
resource "google_service_account" "blockchain_service" {
  account_id   = "pariksha-blockchain-${var.environment}"
  display_name = "ParikshaSuraksha Blockchain Service (${var.environment})"
  project      = var.project_id
}

# --- Exam Session Service ---
resource "google_service_account" "exam_session" {
  account_id   = "pariksha-exam-sess-${var.environment}"
  display_name = "ParikshaSuraksha Exam Session Service (${var.environment})"
  project      = var.project_id
}

# --- IRT Calibrator Worker ---
resource "google_service_account" "irt_calibrator" {
  account_id   = "pariksha-irt-cal-${var.environment}"
  display_name = "ParikshaSuraksha IRT Calibrator Worker (${var.environment})"
  project      = var.project_id
}

# --- Matrix Solver Worker ---
resource "google_service_account" "matrix_solver" {
  account_id   = "pariksha-matrix-${var.environment}"
  display_name = "ParikshaSuraksha Matrix Solver Worker (${var.environment})"
  project      = var.project_id
}

# --- Collusion Detector Worker ---
resource "google_service_account" "collusion_detector" {
  account_id   = "pariksha-col-det-${var.environment}"
  display_name = "ParikshaSuraksha Collusion Detector Worker (${var.environment})"
  project      = var.project_id
}

# --- TLP Generator Worker ---
resource "google_service_account" "tlp_generator" {
  account_id   = "pariksha-tlp-gen-${var.environment}"
  display_name = "ParikshaSuraksha TLP Generator Worker (${var.environment})"
  project      = var.project_id
}

# --- Score Equator Worker ---
resource "google_service_account" "score_equator" {
  account_id   = "pariksha-score-eq-${var.environment}"
  display_name = "ParikshaSuraksha Score Equator Worker (${var.environment})"
  project      = var.project_id
}

# =============================================================================
# Workload Identity Bindings (GKE SA -> GCP SA)
# =============================================================================

locals {
  workload_identity_bindings = {
    api-gateway = {
      gcp_sa    = google_service_account.api_gateway.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "api-gateway"
    }
    question-service = {
      gcp_sa    = google_service_account.question_service.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "question-service"
    }
    paper-generator = {
      gcp_sa    = google_service_account.paper_generator.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "paper-generator"
    }
    crypto-lifecycle = {
      gcp_sa    = google_service_account.crypto_lifecycle.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "crypto-lifecycle"
    }
    collusion-engine = {
      gcp_sa    = google_service_account.collusion_engine.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "collusion-engine"
    }
    blockchain-service = {
      gcp_sa    = google_service_account.blockchain_service.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "blockchain-service"
    }
    exam-session = {
      gcp_sa    = google_service_account.exam_session.email
      k8s_ns    = local.k8s_namespace_api
      k8s_sa    = "exam-session"
    }
    irt-calibrator = {
      gcp_sa    = google_service_account.irt_calibrator.email
      k8s_ns    = local.k8s_namespace_workers
      k8s_sa    = "irt-calibrator"
    }
    matrix-solver = {
      gcp_sa    = google_service_account.matrix_solver.email
      k8s_ns    = local.k8s_namespace_workers
      k8s_sa    = "matrix-solver"
    }
    collusion-detector = {
      gcp_sa    = google_service_account.collusion_detector.email
      k8s_ns    = local.k8s_namespace_workers
      k8s_sa    = "collusion-detector"
    }
    tlp-generator = {
      gcp_sa    = google_service_account.tlp_generator.email
      k8s_ns    = local.k8s_namespace_workers
      k8s_sa    = "tlp-generator"
    }
    score-equator = {
      gcp_sa    = google_service_account.score_equator.email
      k8s_ns    = local.k8s_namespace_workers
      k8s_sa    = "score-equator"
    }
  }
}

resource "google_service_account_iam_member" "workload_identity" {
  for_each = local.workload_identity_bindings

  service_account_id = "projects/${var.project_id}/serviceAccounts/${each.value.gcp_sa}"
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${each.value.k8s_ns}/${each.value.k8s_sa}]"
}

# =============================================================================
# Least-Privilege IAM Role Bindings
# =============================================================================

# --- Question Service: Firestore read/write + Vertex AI (Gemini) ---
resource "google_project_iam_member" "question_service_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.question_service.email}"
}

resource "google_project_iam_member" "question_service_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.question_service.email}"
}

# --- Paper Generator: Firestore read + Redis read ---
resource "google_project_iam_member" "paper_generator_firestore" {
  project = var.project_id
  role    = "roles/datastore.viewer"
  member  = "serviceAccount:${google_service_account.paper_generator.email}"
}

# --- Crypto Lifecycle: KMS encrypt/decrypt + GCS write + Firestore read/write ---
resource "google_project_iam_member" "crypto_lifecycle_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.crypto_lifecycle.email}"
}

resource "google_project_iam_member" "crypto_lifecycle_gcs" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.crypto_lifecycle.email}"
}

# --- Collusion Engine: Firestore read/write + Pub/Sub publish ---
resource "google_project_iam_member" "collusion_engine_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.collusion_engine.email}"
}

resource "google_project_iam_member" "collusion_engine_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.collusion_engine.email}"
}

# --- Blockchain Service: Firestore read (for event cross-referencing) ---
resource "google_project_iam_member" "blockchain_service_firestore" {
  project = var.project_id
  role    = "roles/datastore.viewer"
  member  = "serviceAccount:${google_service_account.blockchain_service.email}"
}

# --- Exam Session: Firestore read/write + GCS write + Pub/Sub publish ---
resource "google_project_iam_member" "exam_session_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.exam_session.email}"
}

resource "google_project_iam_member" "exam_session_gcs" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "serviceAccount:${google_service_account.exam_session.email}"
}

# --- IRT Calibrator: BigQuery read/write + Firestore write ---
resource "google_project_iam_member" "irt_calibrator_bigquery" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.irt_calibrator.email}"
}

resource "google_project_iam_member" "irt_calibrator_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.irt_calibrator.email}"
}

resource "google_project_iam_member" "irt_calibrator_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.irt_calibrator.email}"
}

# --- Matrix Solver: Firestore write + Pub/Sub subscribe ---
resource "google_project_iam_member" "matrix_solver_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.matrix_solver.email}"
}

resource "google_project_iam_member" "matrix_solver_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.matrix_solver.email}"
}

# --- Collusion Detector: BigQuery read/write + Firestore write + GCS write + Pub/Sub subscribe ---
resource "google_project_iam_member" "collusion_detector_bigquery" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.collusion_detector.email}"
}

resource "google_project_iam_member" "collusion_detector_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.collusion_detector.email}"
}

resource "google_project_iam_member" "collusion_detector_gcs" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "serviceAccount:${google_service_account.collusion_detector.email}"
}

resource "google_project_iam_member" "collusion_detector_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.collusion_detector.email}"
}

# --- TLP Generator: Firestore write + Pub/Sub subscribe ---
resource "google_project_iam_member" "tlp_generator_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.tlp_generator.email}"
}

resource "google_project_iam_member" "tlp_generator_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.tlp_generator.email}"
}

# --- Score Equator: BigQuery read/write + Firestore write + Pub/Sub subscribe ---
resource "google_project_iam_member" "score_equator_bigquery" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.score_equator.email}"
}

resource "google_project_iam_member" "score_equator_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.score_equator.email}"
}

resource "google_project_iam_member" "score_equator_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.score_equator.email}"
}

# --- API Gateway: minimal permissions (mostly proxies, uses other SAs) ---
resource "google_project_iam_member" "api_gateway_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.api_gateway.email}"
}

resource "google_project_iam_member" "api_gateway_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api_gateway.email}"
}
