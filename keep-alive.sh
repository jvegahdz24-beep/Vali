#!/bin/bash
# Keep-alive script for NEXUS AI production server
# Restarts the server if it crashes and pings it every 30s to prevent inactivity timeout

cd /home/z/my-project

LOG_FILE="/tmp/nexus-server.log"
KEEPALIVE_LOG="/tmp/nexus-keepalive.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$KEEPALIVE_LOG"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=== NEXUS Keep-Alive Starting ==="

while true; do
  # Check if server is running
  SERVER_PID=$(pgrep -f "next-server" | head -1)
  
  if [ -z "$SERVER_PID" ]; then
    log "Server not running. Starting..."
    NODE_ENV=production NODE_OPTIONS="--max-old-space-size=4096" \
      node .next/standalone/server.js -H 0.0.0.0 -p 3000 >> "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    log "Started server PID: $SERVER_PID"
    sleep 5
  else
    # Server is running, check if it responds
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/ 2>/dev/null)
    
    if [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" = "000" ]; then
      log "Server not responding (HTTP $HTTP_CODE). Killing stale process and restarting..."
      kill -9 "$SERVER_PID" 2>/dev/null
      sleep 2
      NODE_ENV=production NODE_OPTIONS="--max-old-space-size=4096" \
        node .next/standalone/server.js -H 0.0.0.0 -p 3000 >> "$LOG_FILE" 2>&1 &
      SERVER_PID=$!
      log "Restarted server PID: $SERVER_PID"
      sleep 5
    else
      log "Server healthy (HTTP $HTTP_CODE) PID: $SERVER_PID"
    fi
  fi
  
  # Sleep 30 seconds before next check
  sleep 30
done
