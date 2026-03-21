#!/usr/bin/env bash
# ParikshaSuraksha — Hyperledger Fabric Network Teardown
# Usage: ./fabric-teardown.sh <environment>

set -euo pipefail

ENV="${1:-prod}"
NAMESPACE="pariksha-fabric"

echo ">>> Tearing down Hyperledger Fabric network (env: ${ENV})"

# Delete all jobs
echo "  Deleting Fabric jobs..."
kubectl delete jobs --all -n "${NAMESPACE}" --ignore-not-found=true

# Delete all statefulsets (peers, orderers, CAs)
echo "  Deleting Fabric statefulsets..."
kubectl delete statefulsets --all -n "${NAMESPACE}" --ignore-not-found=true

# Delete all services
echo "  Deleting Fabric services..."
kubectl delete services --all -n "${NAMESPACE}" --ignore-not-found=true

# Delete all configmaps
echo "  Deleting Fabric configmaps..."
kubectl delete configmaps --all -n "${NAMESPACE}" --ignore-not-found=true

# Delete all secrets
echo "  Deleting Fabric secrets..."
kubectl delete secrets --all -n "${NAMESPACE}" --ignore-not-found=true

# Delete PVCs
echo "  Deleting Fabric persistent volume claims..."
kubectl delete pvc --all -n "${NAMESPACE}" --ignore-not-found=true

# Wait for all pods to terminate
echo "  Waiting for pod termination..."
kubectl wait --for=delete pod --all -n "${NAMESPACE}" --timeout=120s 2>/dev/null || true

# Delete namespace
echo "  Deleting namespace ${NAMESPACE}..."
kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true

echo ""
echo ">>> Fabric teardown complete for environment: ${ENV}"
