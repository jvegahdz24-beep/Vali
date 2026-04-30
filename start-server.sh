#!/bin/bash
# ValiAutoFlow auto-restart server
cd /home/z/my-project
cp .env .next/standalone/.env 2>/dev/null

while true; do
  NODE_ENV=production NODE_OPTIONS="--max-old-space-size=2048" node .next/standalone/server.js 2>&1
  sleep 1
done
