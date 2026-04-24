#!/bin/bash
# ValiAutoFlow — Quick restart script
cd /home/z/my-project || exit 1

echo "Killing existing processes..."
pkill -f "next" 2>/dev/null
pkill -f "standalone/server" 2>/dev/null
sleep 2

echo "Building production..."
NODE_OPTIONS="--max-old-space-size=2048" npx next build 2>&1 | tail -5

echo "Starting production server..."
bash start-server.sh &
echo "Server starting on port 3000..."
