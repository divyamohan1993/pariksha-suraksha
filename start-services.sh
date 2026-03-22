#!/usr/bin/env bash
# Start all ParikshaSuraksha services on a bare VM
# Usage: bash start-services.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
export GEMINI_API_KEY="${GEMINI_API_KEY:-AIzaSyCy-YSsYYWLZo9twbhjodEeESTPztuqZWI}"
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-lmsforshantithakur}"
export NODE_ENV="development"
export REDIS_HOST="127.0.0.1"
export REDIS_PORT="6379"
export JWT_SECRET="pariksha-mvp-jwt-2026"
export JWT_PRIVATE_KEY="pariksha-mvp-jwt-2026"
export JWT_PUBLIC_KEY="pariksha-mvp-jwt-2026"

echo "Starting ParikshaSuraksha services..."

# Kill any existing processes
pkill -f "nest start\|ts-node\|next dev" 2>/dev/null || true
sleep 2

# Start backend services (nest start with skipLibCheck)
declare -A SERVICES=(
  ["api-gateway"]="3000"
  ["question-service"]="3001"
  ["paper-generator"]="3002"
  ["crypto-lifecycle"]="3003"
  ["exam-session-service"]="3004"
  ["collusion-engine"]="3005"
  ["blockchain-service"]="3006"
)

for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"
  svc_dir="$REPO_DIR/packages/$svc"
  log="/tmp/$svc.log"

  if [ ! -d "$svc_dir/node_modules" ]; then
    echo "  Installing $svc deps..."
    cd "$svc_dir" && npm install --ignore-scripts 2>/dev/null
  fi

  echo "  Starting $svc on :$port"
  cd "$svc_dir"

  # Use nest start with SWC for speed, skip type checking
  PORT=$port \
  GRPC_PORT=$((port + 2000)) \
  KMS_EMULATED=true \
  FABRIC_ENABLED=false \
  GEMINI_API_KEY=$GEMINI_API_KEY \
  nohup npx nest start --watch > "$log" 2>&1 &
done

# Start frontends
echo "  Starting candidate-portal on :3011"
cd "$REPO_DIR/packages/candidate-portal"
[ ! -d "node_modules" ] && npm install 2>/dev/null
nohup npx next dev -p 3011 > /tmp/candidate-portal.log 2>&1 &

echo "  Starting admin-dashboard on :3010"
cd "$REPO_DIR/packages/admin-dashboard"
[ ! -d "node_modules" ] && npm install 2>/dev/null
nohup npx next dev -p 3010 > /tmp/admin-dashboard.log 2>&1 &

echo ""
echo "All services starting. Check logs in /tmp/*.log"
echo "Wait 30-60 seconds for NestJS compilation."
