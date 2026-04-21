#!/bin/bash
cd /home/z/my-project || exit 1

set -a
source .env
set +a
export NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000

cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null
cp -r prisma .next/standalone/ 2>/dev/null
cp -r db .next/standalone/ 2>/dev/null

cd /home/z/my-project/.next/standalone

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting server..." >> /home/z/my-project/server.log
  /usr/local/bin/bun server.js >> /home/z/my-project/server.log 2>&1
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Exited, restarting in 3s..." >> /home/z/my-project/server.log
  sleep 3
done
