#!/bin/bash
cd /opt/pariksha-suraksha && sudo git pull origin master
sudo npm install express 2>/dev/null
sudo pkill -f "node mvp-server" || true
sleep 1
sudo GEMINI_API_KEY="AIzaSyCy-YSsYYWLZo9twbhjodEeESTPztuqZWI" nohup node mvp-server.js > /tmp/mvp-api.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:3000/health
echo ""
echo "API restarted with Gemini key"
