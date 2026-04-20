#!/bin/bash
cd /home/z/my-project || exit 1

# Copy static files
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null

while true; do
  # Only start if port 3000 is not in use
  if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
    echo "$(date): Starting server..." >> /home/z/my-project/server.log
    ( setsid env HOSTNAME=0.0.0.0 NODE_ENV=production bun .next/standalone/server.js >> /home/z/my-project/server.log 2>&1 & ) &
    sleep 5
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
      echo "$(date): Server started successfully" >> /home/z/my-project/server.log
    else
      echo "$(date): Server failed to start" >> /home/z/my-project/server.log
    fi
  fi
  sleep 10
done
