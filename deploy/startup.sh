#!/bin/bash
# ParikshaSuraksha — VM Startup Script
# Runs automatically on VM creation. Installs everything, starts all services.

set -euo pipefail
exec > /var/log/pariksha-startup.log 2>&1

echo "=== ParikshaSuraksha startup $(date) ==="

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx git

# Clone repo
cd /opt
if [ -d pariksha-suraksha ]; then
  cd pariksha-suraksha && git pull origin master
else
  git clone https://github.com/divyamohan1993/pariksha-suraksha.git
  cd pariksha-suraksha
fi

# Install deps for MVP API server
npm install express

# Install deps for candidate portal
cd packages/candidate-portal
npm install
cd ../..

# Install deps for admin dashboard
cd packages/admin-dashboard
npm install
cd ../..

# Configure nginx
cat > /etc/nginx/sites-available/pariksha << 'NGINX'
server {
    listen 80;
    server_name _;
    location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /auth/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
    location /health { proxy_pass http://127.0.0.1:3000; }
    location /admin { proxy_pass http://127.0.0.1:3010; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
    location /_next/ { set $backend http://127.0.0.1:3011; if ($http_referer ~* "/admin") { set $backend http://127.0.0.1:3010; } proxy_pass $backend; proxy_set_header Host $host; }
    location / { proxy_pass http://127.0.0.1:3011; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
}
NGINX
ln -sf /etc/nginx/sites-available/pariksha /etc/nginx/sites-enabled/pariksha
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

# Set env for admin dashboard
echo "NEXT_PUBLIC_API_URL=" > packages/admin-dashboard/.env.local

# Create systemd services for auto-restart

# MVP API Server
cat > /etc/systemd/system/pariksha-api.service << 'SVC'
[Unit]
Description=ParikshaSuraksha MVP API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pariksha-suraksha
ExecStart=/usr/bin/node mvp-server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=GEMINI_API_KEY=${gemini_api_key}

[Install]
WantedBy=multi-user.target
SVC

# Candidate Portal
cat > /etc/systemd/system/pariksha-portal.service << 'SVC'
[Unit]
Description=ParikshaSuraksha Candidate Portal
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pariksha-suraksha/packages/candidate-portal
ExecStart=/usr/bin/npx next dev -p 3011
Restart=always
RestartSec=5
Environment=NODE_ENV=development
Environment=NEXT_TELEMETRY_DISABLED=1

[Install]
WantedBy=multi-user.target
SVC

# Admin Dashboard
cat > /etc/systemd/system/pariksha-admin.service << 'SVC'
[Unit]
Description=ParikshaSuraksha Admin Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pariksha-suraksha/packages/admin-dashboard
ExecStart=/usr/bin/npx next dev -p 3010
Restart=always
RestartSec=5
Environment=NODE_ENV=development
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=NEXT_PUBLIC_API_URL=

[Install]
WantedBy=multi-user.target
SVC

# Enable and start all services
systemctl daemon-reload
systemctl enable pariksha-api pariksha-portal pariksha-admin
systemctl start pariksha-api pariksha-portal pariksha-admin

echo "=== ParikshaSuraksha startup complete $(date) ==="
echo "Services: pariksha-api (:3000), pariksha-portal (:3011), pariksha-admin (:3010)"
echo "Nginx: :80 → routing to all services"
