#!/bin/bash
while true; do
  # Always cd to a known-good directory before each start
  cd /tmp 2>/dev/null
  cd /home/z/my-project 2>/dev/null || { sleep 10; continue; }
  
  echo "$(date '+%Y-%m-%d %H:%M:%S') Starting server..." >> /tmp/valiflow-server.log
  
  # Use cd in a subshell to avoid CWD pollution
  (cd /home/z/my-project && exec node --require /home/z/my-project/.next/standalone/_env-fix.js /home/z/my-project/.next/standalone/server.js) >> /tmp/valiflow-server.log 2>&1
  
  EXIT=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') Server exited ($EXIT), restarting in 5s..." >> /tmp/valiflow-server.log
  sleep 5
done
