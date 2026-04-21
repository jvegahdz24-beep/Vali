#!/bin/bash
cd /home/z/my-project/.next/standalone || exit 1

# Read .env and export
set -a
source /home/z/my-project/.env 2>/dev/null
set +a
export NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting server..." >> /tmp/valiflow-boot.log
  /usr/local/bin/bun server.js >> /tmp/valiflow-boot.log 2>&1
  EXIT=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Server exited ($EXIT), restart in 3s..." >> /tmp/valiflow-boot.log
  sleep 3
done
