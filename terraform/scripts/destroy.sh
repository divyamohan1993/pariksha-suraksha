#!/usr/bin/env bash
###############################################################################
# ParikshaSuraksha — One-Click Destroy Script
# Usage: ./destroy.sh <environment>
# Example: ./destroy.sh dev
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

# Safety check for prod
if [[ "$ENV" == "prod" ]]; then
  echo "WARNING: You are about to destroy the PRODUCTION environment!"
  echo "Type 'destroy-prod' to confirm:"
  read -r CONFIRM
  if [[ "$CONFIRM" != "destroy-prod" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "============================================================"
echo "  ParikshaSuraksha Destroy — Environment: $ENV"
echo "============================================================"

# ---- Step 1: Uninstall Helm chart ----
echo ""
echo "[1/4] Uninstalling Helm chart..."
helm uninstall pariksha --wait 2>/dev/null || echo "  Helm release 'pariksha' not found — skipping."

# ---- Step 2: Fabric teardown ----
echo ""
echo "[2/4] Tearing down Hyperledger Fabric..."
if [[ -f "$REPO_ROOT/scripts/fabric-teardown.sh" ]]; then
  bash "$REPO_ROOT/scripts/fabric-teardown.sh" "$ENV" || echo "  Fabric teardown had warnings — continuing."
else
  echo "  NOTICE: scripts/fabric-teardown.sh not found — skipping."
  echo "  Fabric resources will be cleaned up by Terraform."
fi

# ---- Step 3: Clean up Kubernetes resources that might block Terraform ----
echo ""
echo "[3/4] Cleaning up Kubernetes namespaces..."
for NS in pariksha-fabric pariksha-api pariksha-workers pariksha-web pariksha-data; do
  kubectl delete namespace "$NS" --wait=true --timeout=120s 2>/dev/null || echo "  Namespace $NS not found — skipping."
done

# ---- Step 4: Terraform destroy ----
echo ""
echo "[4/4] Running Terraform destroy..."
cd "$TERRAFORM_DIR"
terraform init -input=false
terraform destroy -auto-approve -var-file="env/${ENV}.tfvars"

echo ""
echo "============================================================"
echo "  All resources destroyed for environment: $ENV"
echo "============================================================"
