#!/bin/bash
# Persistent server launcher - survives sandbox process cleanup
cd /home/z/my-project
cp .env .next/standalone/.env 2>/dev/null

while true; do
  NODE_ENV=production NODE_OPTIONS="--max-old-space-size=2048" node .next/standalone/server.js 2>&1 || true
  echo "[watchdog] Server exited, restarting in 2s..."
  sleep 2
done
