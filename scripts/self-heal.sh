#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ValiFlow Pro — Self-Heal Script
# Detecta si el servidor Next.js está colgado y lo reinicia.
# Diseñado para ejecutarse como cron job o manualmente.
#
# Uso:
#   ./scripts/self-heal.sh              # Ejecutar una vez
#   ./scripts/self-heal.sh --daemon     # Modo daemon (monitorea cada 60s)
#   ./scripts/self-heal.sh --force      # Forzar reinicio sin verificar
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────
PROJECT_DIR="/home/z/my-project"
HEALTH_URL="http://127.0.0.1:3000/api/health"
HEALTH_TIMEOUT=10          # segundos para health check
MAX_RESTARTS_PER_HOUR=5    # evitar restart loop
CHECK_INTERVAL=60          # segundos entre checks (modo daemon)
LOG_FILE="$PROJECT_DIR/.self-heal.log"
NEXT_PORT=3000
MAX_CPU_PERCENT=200        # si el proceso usa >200% CPU por >5min, está colgado
MAX_CPU_DURATION=300       # 5 minutos

# ─── State ───────────────────────────────────────────────────
RESTART_COUNT=0
RESTART_COUNT_FILE="$PROJECT_DIR/.self-heal-count"
LAST_RESTART_FILE="$PROJECT_DIR/.self-heal-last"
PID_FILE="$PROJECT_DIR/.watchdog.pid"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ─── Rate limiter ───────────────────────────────────────────
check_rate_limit() {
  local now=$(date +%s)
  local last_restart=0
  local count=0

  if [ -f "$LAST_RESTART_FILE" ]; then
    last_restart=$(cat "$LAST_RESTART_FILE" 2>/dev/null || echo 0)
  fi
  if [ -f "$RESTART_COUNT_FILE" ]; then
    count=$(cat "$RESTART_COUNT_FILE" 2>/dev/null || echo 0)
  fi

  # Reset counter after 1 hour
  local elapsed=$((now - last_restart))
  if [ "$elapsed" -gt 3600 ]; then
    count=0
    echo "0" > "$RESTART_COUNT_FILE"
  fi

  if [ "$count" -ge "$MAX_RESTARTS_PER_HOUR" ]; then
    log "⚠️ RATE LIMIT: $count reinicios en la última hora. Máximo: $MAX_RESTARTS_PER_HOUR. Abortando."
    return 1
  fi

  return 0
}

record_restart() {
  local count=0
  if [ -f "$RESTART_COUNT_FILE" ]; then
    count=$(cat "$RESTART_COUNT_FILE" 2>/dev/null || echo 0)
  fi
  echo $((count + 1)) > "$RESTART_COUNT_FILE"
  echo "$(date +%s)" > "$LAST_RESTART_FILE"
}

# ─── Health Check ───────────────────────────────────────────
check_health() {
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" \
    --max-time "$HEALTH_TIMEOUT" --noproxy '*' \
    "$HEALTH_URL" 2>/dev/null || echo "000:0")

  local http_code=$(echo "$response" | cut -d: -f1)
  local time_total=$(echo "$response" | cut -d: -f2)

  if [ "$http_code" = "200" ]; then
    log "✅ Health OK (HTTP $http_code, ${time_total}s)"
    return 0
  elif [ "$http_code" = "503" ]; then
    log "⚠️ Health DEGRADED (HTTP 503, ${time_total}s)"
    return 1
  else
    log "❌ Health FAIL (HTTP $http_code, ${time_total}s)"
    return 2
  fi
}

# ─── CPU Hang Detection ─────────────────────────────────────
check_cpu_hang() {
  local pid
  pid=$(lsof -ti :$NEXT_PORT 2>/dev/null | head -1)

  if [ -z "$pid" ]; then
    log "❌ No process on port $NEXT_PORT"
    return 2
  fi

  # Check if process is consuming excessive CPU
  local cpu_percent
  cpu_percent=$(ps -p "$pid" -o %cpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")

  if (( $(echo "$cpu_percent > $MAX_CPU_PERCENT" | bc -l 2>/dev/null || echo 0) )); then
    log "⚠️ Process $pid using ${cpu_percent}% CPU — possible hang"
    return 1
  fi

  return 0
}

# ─── Kill + Restart ─────────────────────────────────────────
kill_and_restart() {
  log "🔧 Iniciando self-heal..."

  # 1. Kill ALL next-server processes
  local pids
  pids=$(pgrep -f "next-server" 2>/dev/null || echo "")

  if [ -n "$pids" ]; then
    log "   Matando procesos: $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 2
  fi

  # 2. Clear stale .next cache if it exists
  if [ -d "$PROJECT_DIR/.next/dev/cache" ]; then
    log "   Limpiando cache .next/dev/cache..."
    rm -rf "$PROJECT_DIR/.next/dev/cache" 2>/dev/null || true
  fi

  # 3. Wait for port to be free
  local retries=0
  while [ $retries -lt 10 ]; do
    if ! lsof -ti :$NEXT_PORT >/dev/null 2>&1; then
      log "   Puerto $NEXT_PORT libre"
      break
    fi
    log "   Esperando puerto $NEXT_PORT... (${retries}s)"
    sleep 1
    retries=$((retries + 1))
  done

  # 4. Start fresh
  log "   Levantando Next.js..."
  cd "$PROJECT_DIR"
  nohup npx next dev -p $NEXT_PORT > /tmp/next-dev.log 2>&1 &
  local new_pid=$!
  log "   Nuevo proceso: PID $new_pid"

  # 5. Wait for it to be ready
  local wait_retries=0
  while [ $wait_retries -lt 30 ]; do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 --noproxy '*' \
      "$HEALTH_URL" 2>/dev/null | grep -q "200"; then
      log "✅ Self-heal COMPLETADO — servidor respondiendo (${wait_retries}x2s)"
      record_restart
      return 0
    fi
    wait_retries=$((wait_retries + 1))

    # Check if process died
    if ! kill -0 $new_pid 2>/dev/null; then
      log "❌ Proceso $new_pid murió inesperadamente"
      log "   Ver log: tail -5 /tmp/next-dev.log"
      tail -3 /tmp/next-dev.log 2>/dev/null | while read line; do
        log "   > $line"
      done
      record_restart
      return 1
    fi
  done

  log "⚠️ Self-heal INCOMPLETO — servidor no respondió después de 60s"
  record_restart
  return 1
}

# ─── Main Logic ─────────────────────────────────────────────
heal_once() {
  log "═══ Self-Heal Check ═══"

  # Check rate limit
  if ! check_rate_limit; then
    return 1
  fi

  # 1. Check health endpoint
  local health_result=0
  check_health || health_result=$?

  if [ "$health_result" -eq 0 ]; then
    # Healthy — check for CPU hang just in case
    if ! check_cpu_hang; then
      log "⚠️ Health OK pero CPU alto — monitoreando..."
      return 0
    fi
    return 0
  fi

  # 2. Not healthy — attempt self-heal
  log "⚠️ Sistema no responde (code: $health_result). Iniciando recovery..."
  kill_and_restart
}

# ─── Daemon Mode ─────────────────────────────────────────────
daemon_mode() {
  log "🛡️ WATCHDOG DAEMON iniciado (PID: $$)"
  log "   Intervalo: ${CHECK_INTERVAL}s | Health URL: $HEALTH_URL"
  echo $$ > "$PID_FILE"

  # Handle graceful exit
  trap 'log "Watchdog detenido"; rm -f "$PID_FILE"; exit 0' SIGTERM SIGINT

  while true; do
    heal_once
    sleep "$CHECK_INTERVAL"
  done
}

# ─── Entry Point ─────────────────────────────────────────────
case "${1:-}" in
  --daemon|-d)
    daemon_mode
    ;;
  --force|-f)
    log "🔄 Forced restart..."
    check_rate_limit && kill_and_restart
    ;;
  --status|-s)
    echo "=== ValiFlow Self-Heal Status ==="
    echo "PID File: $(cat "$PID_FILE" 2>/dev/null || echo 'no daemon running')"
    echo "Restart Count: $(cat "$RESTART_COUNT_FILE" 2>/dev/null || echo '0') / $MAX_RESTARTS_PER_HOUR per hour"
    echo "Last Restart: $(cat "$LAST_RESTART_FILE" 2>/dev/null | xargs -I{} date -d @{} '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'never')"
    echo ""
    echo "Last 10 log entries:"
    tail -10 "$LOG_FILE" 2>/dev/null || echo "No log entries yet"
    ;;
  *)
    heal_once
    ;;
esac
