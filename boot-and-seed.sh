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

# Start server in background
/usr/local/bin/bun server.js >> /home/z/my-project/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null | grep -q "200"; then
    echo "Server ready (PID: $SERVER_PID)"
    break
  fi
  sleep 1
done

# Seed the database
echo "Seeding database..."
SEED_RESULT=$(curl -s -X POST "http://localhost:3000/api/seed?pin=valiflow2026" 2>/dev/null)
echo "Seed result: $SEED_RESULT"

# Keep server alive by waiting
wait $SERVER_PID
