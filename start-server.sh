#!/bin/bash
# ValiAutoFlow — Production Server Startup Script
# Uses standalone build for maximum stability

cd /home/z/my-project || exit 1

# Ensure production build exists
if [ ! -f ".next/standalone/server.js" ]; then
  echo "Building production..."
  NODE_OPTIONS="--max-old-space-size=2048" npx next build
fi

# Copy static assets and required files to standalone
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null
cp -r prisma .next/standalone/ 2>/dev/null
cp -r db .next/standalone/ 2>/dev/null

# Ensure .env exists in standalone
cp .env .next/standalone/.env 2>/dev/null

export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT=${PORT:-3000}
export NODE_OPTIONS="--max-old-space-size=2048"

cd /home/z/my-project/.next/standalone

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting ValiAutoFlow..." >> /home/z/my-project/server.log
  node server.js >> /home/z/my-project/server.log 2>&1
  EXIT=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Server exited ($EXIT), restarting in 3s..." >> /home/z/my-project/server.log
  sleep 3
done
