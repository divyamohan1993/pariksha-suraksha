#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Exam Server Setup Script
# =============================================================================
# Sets up the exam center's local server with all required services:
#   - Node.js (v20 LTS) for the ParikshaSuraksha application
#   - nginx as a reverse proxy
#   - dnsmasq for local DNS and DHCP
#   - chrony as NTP server for synchronized exam timing
#   - Exam data pre-caching for fully offline operation
#
# Usage:
#   sudo ./exam-server-setup.sh [OPTIONS]
#
# Options:
#   --server-ip     IP address for this server (default: 192.168.1.1)
#   --interface     Network interface for the exam LAN (default: eth0)
#   --dhcp-start    Start of DHCP range (default: 192.168.1.11)
#   --dhcp-end      End of DHCP range (default: 192.168.1.250)
#   --repo-url      Git URL for ParikshaSuraksha repo (for pre-exam sync)
#   --repo-path     Local path to repo if already cloned
#
# This script MUST be run as root.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Color output helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "${CYAN}[STEP]${NC}  $*"; }

# -----------------------------------------------------------------------------
# Preflight checks
# -----------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root. Use: sudo $0 $*"
    exit 1
fi

# -----------------------------------------------------------------------------
# Default configuration
# -----------------------------------------------------------------------------
SERVER_IP="192.168.1.1"
LAN_INTERFACE="eth0"
DHCP_START="192.168.1.11"
DHCP_END="192.168.1.250"
SUBNET_MASK="255.255.255.0"
DOMAIN="pariksha.local"
REPO_URL="https://github.com/pariksha-suraksha/pariksha-suraksha.git"
REPO_PATH="/opt/pariksha-suraksha"
APP_PORT=3000
NODE_VERSION="20"

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server-ip)
            SERVER_IP="$2"; shift 2 ;;
        --interface)
            LAN_INTERFACE="$2"; shift 2 ;;
        --dhcp-start)
            DHCP_START="$2"; shift 2 ;;
        --dhcp-end)
            DHCP_END="$2"; shift 2 ;;
        --repo-url)
            REPO_URL="$2"; shift 2 ;;
        --repo-path)
            REPO_PATH="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: $0 [--server-ip IP] [--interface IF] [--dhcp-start IP] [--dhcp-end IP] [--repo-url URL] [--repo-path PATH]"
            exit 0 ;;
        *)
            log_error "Unknown argument: $1"; exit 1 ;;
    esac
done

echo "============================================================================="
echo "  ParikshaSuraksha Exam Server Setup"
echo "============================================================================="
echo ""
echo "  Server IP:      ${SERVER_IP}"
echo "  LAN Interface:  ${LAN_INTERFACE}"
echo "  DHCP Range:     ${DHCP_START} - ${DHCP_END}"
echo "  Domain:         ${DOMAIN}"
echo "  Repo Path:      ${REPO_PATH}"
echo "  App Port:       ${APP_PORT}"
echo ""

# -----------------------------------------------------------------------------
# Step 1: System update and base packages
# -----------------------------------------------------------------------------
log_step "Step 1: Updating system and installing base packages..."

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get upgrade -y -qq

apt-get install -y -qq \
    curl \
    wget \
    git \
    build-essential \
    nginx \
    dnsmasq \
    chrony \
    iptables \
    iptables-persistent \
    sqlite3 \
    jq \
    net-tools \
    htop \
    rsync \
    openssh-server \
    --no-install-recommends

log_info "Base packages installed."

# -----------------------------------------------------------------------------
# Step 2: Install Node.js v20 LTS
# -----------------------------------------------------------------------------
log_step "Step 2: Installing Node.js v${NODE_VERSION} LTS..."

if command -v node &>/dev/null; then
    CURRENT_NODE=$(node --version | sed 's/v//' | cut -d. -f1)
    if [[ "${CURRENT_NODE}" -ge "${NODE_VERSION}" ]]; then
        log_info "Node.js $(node --version) already installed. Skipping."
    else
        log_warn "Node.js $(node --version) is older than v${NODE_VERSION}. Upgrading..."
        INSTALL_NODE=true
    fi
else
    INSTALL_NODE=true
fi

if [[ "${INSTALL_NODE:-false}" == "true" ]]; then
    # Use NodeSource repository for Node.js LTS
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y -qq nodejs
    log_info "Node.js $(node --version) installed."
fi

# Verify npm is available
if ! command -v npm &>/dev/null; then
    log_error "npm not found after Node.js installation."
    exit 1
fi

log_info "Node.js $(node --version), npm $(npm --version) ready."

# -----------------------------------------------------------------------------
# Step 3: Configure static IP on LAN interface
# -----------------------------------------------------------------------------
log_step "Step 3: Configuring static IP on ${LAN_INTERFACE}..."

# Check if using netplan (Ubuntu 18.04+) or /etc/network/interfaces
if [[ -d /etc/netplan ]]; then
    cat > /etc/netplan/01-exam-lan.yaml << EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    ${LAN_INTERFACE}:
      addresses:
        - ${SERVER_IP}/24
      nameservers:
        addresses:
          - 127.0.0.1
      # No gateway -- this is an isolated LAN
EOF

    netplan apply 2>/dev/null || true
    log_info "Static IP configured via netplan."

elif [[ -f /etc/network/interfaces ]]; then
    # Check if already configured
    if ! grep -q "${LAN_INTERFACE}" /etc/network/interfaces 2>/dev/null; then
        cat >> /etc/network/interfaces << EOF

# ParikshaSuraksha Exam LAN
auto ${LAN_INTERFACE}
iface ${LAN_INTERFACE} inet static
    address ${SERVER_IP}
    netmask ${SUBNET_MASK}
    # No gateway -- isolated LAN
EOF
        ifup "${LAN_INTERFACE}" 2>/dev/null || true
        log_info "Static IP configured via /etc/network/interfaces."
    else
        log_warn "${LAN_INTERFACE} already configured in /etc/network/interfaces."
    fi
else
    log_warn "Could not determine network configuration method."
    log_warn "Please manually configure ${LAN_INTERFACE} with IP ${SERVER_IP}/24."
fi

# -----------------------------------------------------------------------------
# Step 4: Configure dnsmasq (DNS + DHCP)
# -----------------------------------------------------------------------------
log_step "Step 4: Configuring dnsmasq for DNS and DHCP..."

# Stop systemd-resolved if running (it conflicts with dnsmasq on port 53)
if systemctl is-active systemd-resolved &>/dev/null; then
    systemctl stop systemd-resolved
    systemctl disable systemd-resolved
    # Point resolv.conf to localhost (dnsmasq will handle DNS)
    rm -f /etc/resolv.conf
    echo "nameserver 127.0.0.1" > /etc/resolv.conf
    log_info "systemd-resolved stopped; using dnsmasq for DNS."
fi

# Backup original dnsmasq config
if [[ -f /etc/dnsmasq.conf ]]; then
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup.$(date +%Y%m%d%H%M%S)
fi

cat > /etc/dnsmasq.conf << EOF
# =============================================================================
# ParikshaSuraksha -- dnsmasq Configuration
# Provides DNS and DHCP for the exam center LAN.
# =============================================================================

# ---- General ----
# Listen only on the exam LAN interface and localhost
interface=${LAN_INTERFACE}
listen-address=${SERVER_IP},127.0.0.1
bind-interfaces

# Don't forward DNS queries upstream (no internet)
no-resolv
no-poll

# ---- DNS ----
# Resolve pariksha.local to this server
address=/${DOMAIN}/${SERVER_IP}

# Block ALL other domains -- resolve to 0.0.0.0 (sinkhole)
# This is a defense-in-depth measure: even if iptables is misconfigured,
# DNS resolution for external domains will fail.
address=/#/0.0.0.0

# Local domain
domain=${DOMAIN}
local=/${DOMAIN}/

# ---- DHCP ----
# Assign IPs to kiosk machines
dhcp-range=${DHCP_START},${DHCP_END},${SUBNET_MASK},12h

# DHCP options
dhcp-option=option:router,${SERVER_IP}
dhcp-option=option:dns-server,${SERVER_IP}
dhcp-option=option:ntp-server,${SERVER_IP}
dhcp-option=option:domain-name,${DOMAIN}

# Authoritative DHCP server (this is the only DHCP server on the network)
dhcp-authoritative

# DHCP lease file
dhcp-leasefile=/var/lib/dnsmasq/dnsmasq.leases

# ---- Logging ----
# Log DNS queries (useful for detecting tampering attempts)
log-queries
log-dhcp
log-facility=/var/log/dnsmasq.log

# ---- Security ----
# Don't read /etc/hosts (prevent pollution)
no-hosts

# Add our own hosts
addn-hosts=/etc/dnsmasq.hosts

# Cache size
cache-size=1000
EOF

# Create the hosts file for dnsmasq
cat > /etc/dnsmasq.hosts << EOF
${SERVER_IP} ${DOMAIN}
${SERVER_IP} exam.${DOMAIN}
${SERVER_IP} api.${DOMAIN}
EOF

# Create the lease directory
mkdir -p /var/lib/dnsmasq

# Create log file
touch /var/log/dnsmasq.log
chown dnsmasq:dnsmasq /var/log/dnsmasq.log 2>/dev/null || true

# Enable and restart dnsmasq
systemctl enable dnsmasq
systemctl restart dnsmasq

log_info "dnsmasq configured for DNS and DHCP."

# Verify DNS resolution
sleep 1
if command -v dig &>/dev/null; then
    RESOLVED=$(dig +short "${DOMAIN}" @127.0.0.1 2>/dev/null || echo "FAILED")
    if [[ "${RESOLVED}" == "${SERVER_IP}" ]]; then
        log_info "DNS verification: ${DOMAIN} -> ${RESOLVED} (correct)"
    else
        log_warn "DNS verification: ${DOMAIN} -> ${RESOLVED} (expected ${SERVER_IP})"
    fi
elif command -v nslookup &>/dev/null; then
    nslookup "${DOMAIN}" 127.0.0.1 2>/dev/null && log_info "DNS resolution working." || log_warn "DNS resolution check failed."
fi

# -----------------------------------------------------------------------------
# Step 5: Configure chrony as NTP server
# -----------------------------------------------------------------------------
log_step "Step 5: Configuring chrony as NTP server..."

# Backup original chrony config
if [[ -f /etc/chrony/chrony.conf ]]; then
    cp /etc/chrony/chrony.conf /etc/chrony/chrony.conf.backup.$(date +%Y%m%d%H%M%S)
fi

cat > /etc/chrony/chrony.conf << EOF
# =============================================================================
# ParikshaSuraksha -- Chrony NTP Server Configuration
# This server provides synchronized time to all kiosk machines.
# =============================================================================

# ---- Time Sources ----
# Use the system clock as the reference when offline.
# Before the exam, sync with public NTP servers, then disconnect internet.
# The local clock becomes the authoritative source during the exam.

# Public NTP servers (used during pre-exam sync when internet is available)
pool ntp.ubuntu.com iburst maxsources 4
pool time.google.com iburst maxsources 2

# Local clock as fallback (stratum 10 -- used when no external sources)
# During the exam (no internet), this becomes the primary source.
local stratum 10

# ---- Serve time to the exam LAN ----
# Allow all machines on the exam subnet to sync their clocks
allow 192.168.1.0/24

# ---- Drift and corrections ----
driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync

# ---- Logging ----
logdir /var/log/chrony
log measurements statistics tracking
EOF

systemctl enable chrony
systemctl restart chrony

log_info "Chrony NTP server configured. Kiosk machines will sync to ${SERVER_IP}."

# -----------------------------------------------------------------------------
# Step 6: Clone/copy ParikshaSuraksha repository
# -----------------------------------------------------------------------------
log_step "Step 6: Setting up ParikshaSuraksha application..."

if [[ -d "${REPO_PATH}" ]]; then
    log_info "Repository already exists at ${REPO_PATH}."
    if [[ -d "${REPO_PATH}/.git" ]]; then
        log_info "Pulling latest changes..."
        cd "${REPO_PATH}"
        git pull 2>/dev/null || log_warn "Git pull failed (may be offline). Using existing code."
        cd -
    fi
else
    log_info "Cloning ParikshaSuraksha repository..."
    if git clone "${REPO_URL}" "${REPO_PATH}" 2>/dev/null; then
        log_info "Repository cloned to ${REPO_PATH}."
    else
        log_warn "Git clone failed (may be offline). Creating directory structure..."
        mkdir -p "${REPO_PATH}"
    fi
fi

# Install Node.js dependencies
if [[ -f "${REPO_PATH}/package.json" ]]; then
    cd "${REPO_PATH}"
    npm install --production 2>/dev/null || log_warn "npm install failed. Dependencies may need manual installation."
    cd -
    log_info "Node.js dependencies installed."
else
    log_warn "No package.json found at ${REPO_PATH}. Application may need manual setup."
fi

# Create data directories
mkdir -p "${REPO_PATH}/data/exams"
mkdir -p "${REPO_PATH}/data/responses"
mkdir -p "${REPO_PATH}/data/cache"
mkdir -p "${REPO_PATH}/data/uploads"
mkdir -p "${REPO_PATH}/logs"

# Set ownership
chown -R www-data:www-data "${REPO_PATH}/data" 2>/dev/null || true
chown -R www-data:www-data "${REPO_PATH}/logs" 2>/dev/null || true

log_info "Application directory structure ready."

# -----------------------------------------------------------------------------
# Step 7: Create systemd service for the Node.js application
# -----------------------------------------------------------------------------
log_step "Step 7: Creating systemd service for ParikshaSuraksha..."

cat > /etc/systemd/system/pariksha-server.service << EOF
[Unit]
Description=ParikshaSuraksha Exam Server (Node.js)
After=network-online.target dnsmasq.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${REPO_PATH}
ExecStart=/usr/bin/node ${REPO_PATH}/mvp-server.js
Restart=always
RestartSec=5

# Environment variables
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOST=0.0.0.0
Environment=DATA_DIR=${REPO_PATH}/data
Environment=LOG_DIR=${REPO_PATH}/logs
Environment=EXAM_DOMAIN=${DOMAIN}

# Security hardening for the Node.js process
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${REPO_PATH}/data ${REPO_PATH}/logs
PrivateTmp=true

# Resource limits
LimitNOFILE=65535
MemoryMax=2G
CPUQuota=80%

# Logging
StandardOutput=append:${REPO_PATH}/logs/server-stdout.log
StandardError=append:${REPO_PATH}/logs/server-stderr.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pariksha-server.service

# Start the service if the server file exists
if [[ -f "${REPO_PATH}/mvp-server.js" ]]; then
    systemctl start pariksha-server.service
    sleep 2
    if systemctl is-active pariksha-server.service &>/dev/null; then
        log_info "ParikshaSuraksha server started successfully on port ${APP_PORT}."
    else
        log_warn "ParikshaSuraksha server failed to start. Check logs at ${REPO_PATH}/logs/"
    fi
else
    log_warn "mvp-server.js not found. Service is enabled but not started."
    log_warn "Place your server file at ${REPO_PATH}/mvp-server.js and run: systemctl start pariksha-server"
fi

# -----------------------------------------------------------------------------
# Step 8: Configure nginx as reverse proxy
# -----------------------------------------------------------------------------
log_step "Step 8: Configuring nginx as reverse proxy..."

# Remove default site
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/pariksha << EOF
# =============================================================================
# ParikshaSuraksha -- nginx Reverse Proxy Configuration
# =============================================================================

# Rate limiting zone (prevent abuse from any single kiosk)
limit_req_zone \$binary_remote_addr zone=exam:10m rate=30r/s;

# Upstream Node.js application
upstream pariksha_app {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

server {
    listen 80;
    server_name ${DOMAIN} ${SERVER_IP};

    # --- Security Headers ---
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self';" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=()" always;

    # --- Rate Limiting ---
    limit_req zone=exam burst=50 nodelay;

    # --- Client body size (for file uploads if any) ---
    client_max_body_size 10M;

    # --- Timeouts ---
    proxy_connect_timeout 10s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # --- Logging ---
    access_log /var/log/nginx/pariksha-access.log;
    error_log  /var/log/nginx/pariksha-error.log;

    # --- API and Application ---
    location / {
        proxy_pass http://pariksha_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket support (for real-time heartbeat/monitoring)
        proxy_cache_bypass \$http_upgrade;
    }

    # --- Static assets (served directly by nginx for performance) ---
    location /static/ {
        alias ${REPO_PATH}/public/static/;
        expires 1h;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # --- Health check endpoint (no rate limit) ---
    location /api/health {
        limit_req off;
        proxy_pass http://pariksha_app;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # --- Heartbeat endpoint (no rate limit, high frequency) ---
    location /api/heartbeat {
        limit_req off;
        proxy_pass http://pariksha_app;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # --- Block access to hidden files ---
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # --- Block access to data directory ---
    location /data/ {
        deny all;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/pariksha /etc/nginx/sites-enabled/pariksha

# Test nginx configuration
if nginx -t 2>/dev/null; then
    systemctl enable nginx
    systemctl restart nginx
    log_info "nginx configured and running as reverse proxy."
else
    log_error "nginx configuration test failed. Check /etc/nginx/sites-available/pariksha"
fi

# -----------------------------------------------------------------------------
# Step 9: Create exam data pre-caching script
# -----------------------------------------------------------------------------
log_step "Step 9: Creating exam data pre-caching scripts..."

cat > /usr/local/bin/pariksha-cache-exam.sh << 'CACHEEOF'
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Exam Data Pre-Cache Script
# Run this BEFORE the exam to download and cache all exam data locally.
# The exam center must have internet access during this step.
# =============================================================================

set -euo pipefail

REPO_PATH="/opt/pariksha-suraksha"
DATA_DIR="${REPO_PATH}/data"
CACHE_DIR="${DATA_DIR}/cache"
API_URL="${1:-http://localhost:3000}"
EXAM_ID="${2:-}"

if [[ -z "${EXAM_ID}" ]]; then
    echo "Usage: $0 <API_URL> <EXAM_ID>"
    echo "Example: $0 http://localhost:3000 EXAM_2026_001"
    exit 1
fi

echo "Pre-caching exam data for: ${EXAM_ID}"
echo "API URL: ${API_URL}"
echo ""

mkdir -p "${CACHE_DIR}/${EXAM_ID}"

# Download exam metadata
echo "Downloading exam metadata..."
curl -sf "${API_URL}/api/exam/${EXAM_ID}/metadata" \
    -o "${CACHE_DIR}/${EXAM_ID}/metadata.json" && echo "  OK" || echo "  FAILED"

# Download questions
echo "Downloading questions..."
curl -sf "${API_URL}/api/exam/${EXAM_ID}/questions" \
    -o "${CACHE_DIR}/${EXAM_ID}/questions.json" && echo "  OK" || echo "  FAILED"

# Download media assets (images, diagrams, etc.)
echo "Downloading media assets..."
if [[ -f "${CACHE_DIR}/${EXAM_ID}/questions.json" ]]; then
    # Extract media URLs from questions and download each
    MEDIA_URLS=$(jq -r '.. | .imageUrl? // .mediaUrl? // .diagramUrl? // empty' \
        "${CACHE_DIR}/${EXAM_ID}/questions.json" 2>/dev/null || true)

    MEDIA_DIR="${CACHE_DIR}/${EXAM_ID}/media"
    mkdir -p "${MEDIA_DIR}"

    TOTAL=0
    DOWNLOADED=0
    while IFS= read -r url; do
        if [[ -n "${url}" && "${url}" != "null" ]]; then
            TOTAL=$((TOTAL + 1))
            FILENAME=$(basename "${url}")
            if curl -sf "${url}" -o "${MEDIA_DIR}/${FILENAME}"; then
                DOWNLOADED=$((DOWNLOADED + 1))
            fi
        fi
    done <<< "${MEDIA_URLS}"
    echo "  Downloaded ${DOWNLOADED}/${TOTAL} media files."
fi

# Verify cache integrity
echo ""
echo "Verifying cache integrity..."
if [[ -f "${CACHE_DIR}/${EXAM_ID}/metadata.json" && \
      -f "${CACHE_DIR}/${EXAM_ID}/questions.json" ]]; then

    QUESTION_COUNT=$(jq '. | length' "${CACHE_DIR}/${EXAM_ID}/questions.json" 2>/dev/null || echo "0")
    echo "  Metadata:  OK"
    echo "  Questions: ${QUESTION_COUNT} cached"
    echo ""
    echo "Exam data pre-cached successfully."
    echo "The exam center can now operate fully offline."
else
    echo "  WARNING: Some files are missing. Re-run this script with internet access."
fi
CACHEEOF

chmod +x /usr/local/bin/pariksha-cache-exam.sh

log_info "Exam data pre-caching script created at /usr/local/bin/pariksha-cache-exam.sh"

# -----------------------------------------------------------------------------
# Step 10: Create exam server firewall rules
# -----------------------------------------------------------------------------
log_step "Step 10: Configuring exam server firewall..."

# The exam server needs to accept traffic from the LAN but block everything else

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT  # Server can make outbound connections (for pre-exam sync)

# Loopback
iptables -A INPUT -i lo -j ACCEPT

# Established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow all traffic from the exam LAN subnet
iptables -A INPUT -i "${LAN_INTERFACE}" -s 192.168.1.0/24 -j ACCEPT

# Allow DHCP (broadcast)
iptables -A INPUT -p udp --dport 67 -j ACCEPT

# Log and drop everything else on input
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "PARIKSHA_SERVER_BLOCKED: " --log-level 4
iptables -A INPUT -j DROP

# Save rules
if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save 2>/dev/null || true
else
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

log_info "Exam server firewall configured."

# -----------------------------------------------------------------------------
# Step 11: Create internet disconnect/reconnect scripts
# -----------------------------------------------------------------------------
log_step "Step 11: Creating internet management scripts..."

# Script to disconnect internet (before exam)
cat > /usr/local/bin/pariksha-disconnect-internet.sh << 'DISCONNEOF'
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Disconnect Internet
# Run this before the exam starts to isolate the LAN.
# =============================================================================
set -euo pipefail

echo "Disconnecting internet..."

# Find and disable WAN interfaces (anything that is NOT the exam LAN interface)
EXAM_IF="${1:-eth0}"

for iface in $(ls /sys/class/net/ | grep -v lo | grep -v "${EXAM_IF}"); do
    echo "  Disabling interface: ${iface}"
    ip link set "${iface}" down 2>/dev/null || true
done

# Remove default route (prevents internet even if interface comes back up)
ip route del default 2>/dev/null || true

# Verify no default route
if ip route show | grep -q default; then
    echo "WARNING: Default route still exists!"
    ip route show | grep default
else
    echo "  Default route removed."
fi

echo ""
echo "Internet disconnected. Exam LAN is now isolated."
echo "To reconnect after the exam, run: pariksha-reconnect-internet.sh"
DISCONNEOF

# Script to reconnect internet (after exam, for result upload)
cat > /usr/local/bin/pariksha-reconnect-internet.sh << 'RECONNEOF'
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Reconnect Internet
# Run this AFTER the exam to upload results.
# =============================================================================
set -euo pipefail

echo "Reconnecting internet..."

# Re-enable all network interfaces
for iface in $(ls /sys/class/net/ | grep -v lo); do
    echo "  Enabling interface: ${iface}"
    ip link set "${iface}" up 2>/dev/null || true
done

# Restart NetworkManager or networkd to restore routes
if systemctl is-enabled NetworkManager &>/dev/null; then
    systemctl restart NetworkManager
elif systemctl is-enabled systemd-networkd &>/dev/null; then
    systemctl restart systemd-networkd
fi

# Wait for connectivity
echo "  Waiting for connectivity..."
sleep 5

if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
    echo "Internet connectivity restored."
else
    echo "WARNING: No internet connectivity detected."
    echo "Check physical cable connections and router."
fi
RECONNEOF

chmod +x /usr/local/bin/pariksha-disconnect-internet.sh
chmod +x /usr/local/bin/pariksha-reconnect-internet.sh

log_info "Internet management scripts created."

# -----------------------------------------------------------------------------
# Step 12: Create log rotation configuration
# -----------------------------------------------------------------------------
log_step "Step 12: Configuring log rotation..."

cat > /etc/logrotate.d/pariksha << EOF
${REPO_PATH}/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload pariksha-server 2>/dev/null || true
    endscript
}

/var/log/dnsmasq.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 dnsmasq dnsmasq
    postrotate
        systemctl restart dnsmasq 2>/dev/null || true
    endscript
}
EOF

log_info "Log rotation configured."

# -----------------------------------------------------------------------------
# Step 13: Create system health check script
# -----------------------------------------------------------------------------
log_step "Step 13: Creating system health check script..."

cat > /usr/local/bin/pariksha-healthcheck.sh << 'HEALTHEOF'
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Exam Server Health Check
# Quick check that all services are running correctly.
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

check_service() {
    local name="$1"
    if systemctl is-active "${name}" &>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC}  ${name}"
    else
        echo -e "  ${RED}[FAIL]${NC} ${name}"
    fi
}

check_port() {
    local port="$1"
    local name="$2"
    if ss -tlnp | grep -q ":${port} "; then
        echo -e "  ${GREEN}[OK]${NC}  Port ${port} (${name})"
    else
        echo -e "  ${RED}[FAIL]${NC} Port ${port} (${name})"
    fi
}

echo "============================================"
echo "  ParikshaSuraksha Server Health Check"
echo "============================================"
echo ""
echo "Services:"
check_service "nginx"
check_service "pariksha-server"
check_service "dnsmasq"
check_service "chrony"
echo ""
echo "Ports:"
check_port 80 "nginx (HTTP)"
check_port 3000 "Node.js app"
check_port 53 "dnsmasq (DNS)"
check_port 67 "dnsmasq (DHCP)"
echo ""
echo "DNS Resolution:"
RESOLVED=$(dig +short pariksha.local @127.0.0.1 2>/dev/null || echo "FAILED")
if [[ "${RESOLVED}" == "192.168.1.1" ]]; then
    echo -e "  ${GREEN}[OK]${NC}  pariksha.local -> ${RESOLVED}"
else
    echo -e "  ${RED}[FAIL]${NC} pariksha.local -> ${RESOLVED} (expected 192.168.1.1)"
fi
echo ""
echo "NTP Status:"
chronyc tracking 2>/dev/null | head -5 | sed 's/^/  /'
echo ""
echo "DHCP Leases:"
LEASE_COUNT=$(wc -l < /var/lib/dnsmasq/dnsmasq.leases 2>/dev/null || echo "0")
echo "  Active leases: ${LEASE_COUNT}"
echo ""
echo "Disk Usage:"
df -h / | tail -1 | awk '{print "  Root: " $3 " used of " $2 " (" $5 " full)"}'
echo ""
echo "Memory:"
free -h | grep Mem | awk '{print "  RAM: " $3 " used of " $2}'
echo ""
echo "============================================"
HEALTHEOF

chmod +x /usr/local/bin/pariksha-healthcheck.sh

log_info "Health check script created at /usr/local/bin/pariksha-healthcheck.sh"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "============================================================================="
echo "  ParikshaSuraksha Exam Server Setup Complete"
echo "============================================================================="
echo ""
echo "  Server IP:      ${SERVER_IP}"
echo "  Domain:         ${DOMAIN}"
echo "  Application:    ${REPO_PATH}"
echo "  App Port:       ${APP_PORT}"
echo ""
echo "  Services installed and enabled:"
echo "    [x] Node.js v${NODE_VERSION} LTS"
echo "    [x] nginx (reverse proxy on port 80)"
echo "    [x] dnsmasq (DNS + DHCP)"
echo "    [x] chrony (NTP server)"
echo "    [x] pariksha-server (systemd service)"
echo ""
echo "  Management commands:"
echo "    pariksha-healthcheck.sh            -- Check all services"
echo "    pariksha-cache-exam.sh URL EXAM_ID -- Pre-cache exam data"
echo "    pariksha-disconnect-internet.sh    -- Isolate LAN (before exam)"
echo "    pariksha-reconnect-internet.sh     -- Restore internet (after exam)"
echo ""
echo "  Pre-exam checklist:"
echo "    1. Connect to internet"
echo "    2. Run: pariksha-cache-exam.sh http://central-server.com EXAM_ID"
echo "    3. Run: pariksha-disconnect-internet.sh"
echo "    4. Run: pariksha-healthcheck.sh (verify all green)"
echo "    5. Power on kiosk machines"
echo ""
echo "============================================================================="
