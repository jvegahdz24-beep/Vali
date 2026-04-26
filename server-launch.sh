#!/bin/bash
# ValiAutoFlow — Server launcher with auto-restart
cd /home/z/my-project/.next/standalone || exit 1

export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT=3000

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting ValiAutoFlow..." >> /home/z/my-project/server.log
  node server.js >> /home/z/my-project/server.log 2>&1
  EXIT=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Server exited ($EXIT), restarting in 3s..." >> /home/z/my-project/server.log
  sleep 3
done
