#!/usr/bin/env bash
# ParikshaSuraksha — One-Click VM Deployment
# Usage: ./deploy-vm.sh
#
# Deploys the full system on a single GCP VM via docker-compose.
# All services, frontends, workers, and data layer on one machine.

set -euo pipefail

PROJECT_ID="lmsforshantithakur"
ZONE="asia-south1-a"
VM_NAME="pariksha-vm"
REPO="https://github.com/divyamohan1993/pariksha-suraksha.git"

echo "═══════════════════════════════════════════════════"
echo "  ParikshaSuraksha — VM Deployment"
echo "═══════════════════════════════════════════════════"

# Get VM IP
VM_IP=$(gcloud compute instances describe ${VM_NAME} \
  --zone=${ZONE} --project=${PROJECT_ID} \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null)

echo "  VM: ${VM_NAME} (${VM_IP})"
echo ""

echo ">>> Step 1: Installing Docker on VM..."
gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command="
  # Container-Optimized OS already has Docker
  docker --version && docker compose version 2>/dev/null || {
    # Fallback: install docker compose plugin
    sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
  }
" 2>&1

echo ""
echo ">>> Step 2: Cloning/updating repo on VM..."
gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command="
  if [ -d /home/\$(whoami)/pariksha-suraksha ]; then
    cd /home/\$(whoami)/pariksha-suraksha && git pull origin master
  else
    git clone ${REPO} /home/\$(whoami)/pariksha-suraksha
  fi
" 2>&1

echo ""
echo ">>> Step 3: Building and starting all services..."
gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command="
  cd /home/\$(whoami)/pariksha-suraksha
  docker compose -f docker-compose.prod.yml up --build -d
" 2>&1

echo ""
echo ">>> Step 4: Waiting for services to start..."
sleep 10

echo ""
echo ">>> Step 5: Checking service health..."
gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command="
  docker compose -f /home/\$(whoami)/pariksha-suraksha/docker-compose.prod.yml ps
" 2>&1

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  Candidate Portal:  http://${VM_IP}"
echo "  About Page:        http://${VM_IP}/about"
echo "  Pitch Deck:        http://${VM_IP}/pitch"
echo "  Exam Terminal:     http://${VM_IP}/exam"
echo "  Admin Dashboard:   http://${VM_IP}/admin"
echo "  API Gateway:       http://${VM_IP}/api/v1"
echo "  Health Check:      http://${VM_IP}/health"
echo ""
echo "  To set up DNS: point pariksha.dmj.one A record to ${VM_IP}"
echo "═══════════════════════════════════════════════════"
