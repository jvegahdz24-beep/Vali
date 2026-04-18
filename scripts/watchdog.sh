#!/bin/bash
# ValiAutoFlow — Keep-alive watchdog
# Reinicia el servidor automáticamente si se muere

cd /home/z/my-project

while true; do
  echo "[$(date '+%H:%M:%S')] 🚀 Iniciando ValiAutoFlow..."
  
  # Run Next.js dev server
  npx next dev -p 3000 2>&1 | tee -a /tmp/valiflow-watchdog.log
  
  EXIT_CODE=$?
  echo "[$(date '+%H:%M:%S')] ❌ Servidor murió con código: $EXIT_CODE"
  echo "[$(date '+%H:%M:%S')] 🔄 Reiniciando en 3s..."
  sleep 3
done
