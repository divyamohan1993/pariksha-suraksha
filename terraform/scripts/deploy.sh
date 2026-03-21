#!/usr/bin/env bash
###############################################################################
# ParikshaSuraksha — One-Click Deploy Script
# Usage: ./deploy.sh <environment>
# Example: ./deploy.sh prod
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$TERRAFORM_DIR")"
ENV="${1:-dev}"

# Validate environment
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "ERROR: Environment must be 'dev' or 'prod'. Got: $ENV"
  exit 1
fi

echo "============================================================"
echo "  ParikshaSuraksha Deploy — Environment: $ENV"
echo "============================================================"

# ---- Step 1: Terraform Init & Apply ----
echo ""
echo "[1/5] Running Terraform init..."
cd "$TERRAFORM_DIR"
terraform init -input=false

echo ""
echo "[2/5] Running Terraform plan..."
terraform plan -var-file="env/${ENV}.tfvars" -out=tfplan

echo ""
echo "[3/5] Running Terraform apply..."
terraform apply -auto-approve tfplan
rm -f tfplan

# ---- Step 2: Configure kubectl ----
echo ""
echo "[4/5] Configuring kubectl..."
CLUSTER_NAME=$(terraform output -raw gke_cluster_name)
REGION=$(terraform output -json | python3 -c "import sys,json; print(json.load(sys.stdin).get('region',{}).get('value','asia-south1'))" 2>/dev/null || echo "asia-south1")
PROJECT_ID=$(grep 'project_id' "env/${ENV}.tfvars" | cut -d'"' -f2)

gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID"

echo "kubectl context set to cluster: $CLUSTER_NAME"

# ---- Step 3: Fabric setup ----
echo ""
echo "[5/5] Setting up Hyperledger Fabric..."
if [[ -f "$REPO_ROOT/scripts/fabric-setup.sh" ]]; then
  bash "$REPO_ROOT/scripts/fabric-setup.sh" "$ENV"
else
  echo "  NOTICE: scripts/fabric-setup.sh not found — skipping Fabric bootstrap."
  echo "  Fabric namespace and PVCs are provisioned by Terraform."
  echo "  Run fabric-setup.sh manually when available."
fi

# ---- Step 4: Helm install ----
echo ""
echo "[5/5] Installing Helm chart..."
HELM_DIR="$REPO_ROOT/helm"
if [[ -d "$HELM_DIR" ]]; then
  helm upgrade --install pariksha "$HELM_DIR" \
    -f "$HELM_DIR/values.yaml" \
    -f "$HELM_DIR/values-${ENV}.yaml" \
    --wait \
    --timeout 10m \
    --create-namespace
  echo "Helm chart installed successfully."
else
  echo "  NOTICE: helm/ directory not found — skipping Helm install."
  echo "  Infrastructure is ready. Deploy application via Helm when chart is available."
fi

echo ""
echo "============================================================"
echo "  Deploy complete!"
echo "  Cluster: $CLUSTER_NAME"
echo "  Environment: $ENV"
echo "  URL: https://pariksha.dmj.one"
echo "============================================================"
