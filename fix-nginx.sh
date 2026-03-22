#!/bin/bash
cat > /tmp/pariksha-nginx << 'EOF'
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
EOF
sudo cp /tmp/pariksha-nginx /etc/nginx/sites-available/pariksha
sudo /usr/sbin/nginx -t && sudo systemctl reload nginx
echo "NEXT_PUBLIC_API_URL=" > ~/pariksha-suraksha/packages/admin-dashboard/.env.local
kill $(pgrep -f "next dev.*3010") 2>/dev/null; sleep 1
cd ~/pariksha-suraksha/packages/admin-dashboard
nohup npx next dev -p 3010 > /tmp/admin-dashboard.log 2>&1 &
sleep 3
echo "DONE"
