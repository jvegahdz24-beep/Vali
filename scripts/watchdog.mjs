#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Watchdog (PROCESO INDEPENDIENTE)
// Monitorea la salud del servidor Next.js y auto-recupera.
// NO depende de Next.js — corre como proceso separado.
//
// Uso: node scripts/watchdog.mjs [--interval 60] [--daemon]
// ═══════════════════════════════════════════════════════════════

const HEALTH_URL = 'http://127.0.0.1:3000/api/health'
const NEXT_PORT = 3000
const MAX_FAILS = 3           // consecutive failures before restart
const CHECK_INTERVAL = 60     // seconds
const HEALTH_TIMEOUT = 8000   // ms
const PROJECT_DIR = '/home/z/my-project'
const LOG_FILE = `${PROJECT_DIR}/.watchdog.log`

// ─── State ──────────────────────────────────────────────────
let consecutiveFails = 0
let totalRestarts = 0
let totalChecks = 0
let startTime = Date.now()

// ─── Logging ────────────────────────────────────────────────
function log(level, msg) {
  const ts = new Date().toISOString().slice(0, 19)
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}`
  console.log(line)
  try {
    const fs = require('fs')
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {}
}

// ─── Health Check ───────────────────────────────────────────
async function checkHealth() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT)

  try {
    const start = Date.now()
    const res = await fetch(HEALTH_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(timeout)

    const latencyMs = Date.now() - start
    totalChecks++

    if (res.ok) {
      const data = await res.json()
      consecutiveFails = 0
      log('ok', `Health OK (${res.status}) — ${data.components?.worker?.pendingTasks || 0} pending tasks, ${latencyMs}ms`)
      return { healthy: true, latencyMs, data }
    } else {
      consecutiveFails++
      log('warn', `Health DEGRADED (${res.status}) — fails: ${consecutiveFails}/${MAX_FAILS}, ${latencyMs}ms`)
      return { healthy: false, degraded: true, latencyMs, status: res.status }
    }
  } catch (err) {
    clearTimeout(timeout)
    consecutiveFails++
    totalChecks++
    const msg = err.name === 'AbortError' ? 'timeout' : err.message
    log('error', `Health FAIL — ${msg} (fails: ${consecutiveFails}/${MAX_FAILS})`)
    return { healthy: false, degraded: false, error: msg }
  }
}

// ─── Kill + Restart ─────────────────────────────────────────
async function restartServer() {
  log('warn', '═══ RESTART INITIATED ═══')

  // 1. Kill all next-server processes
  try {
    const { execSync } = require('child_process')
    const pids = execSync('pgrep -f "next-server" 2>/dev/null || true', { encoding: 'utf8' }).trim()
    if (pids) {
      log('info', `Killing processes: ${pids}`)
      try {
        execSync(`kill -9 ${pids.replace(/\n/g, ' ')} 2>/dev/null || true`)
      } catch {}
      await sleep(2000)
    }
  } catch {}

  // 2. Clear stale cache
  try {
    const fs = require('fs')
    const path = require('path')
    const cacheDir = path.join(PROJECT_DIR, '.next', 'dev', 'cache')
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true })
      log('info', 'Cleared .next/dev/cache')
    }
  } catch {}

  // 3. Wait for port to be free
  for (let i = 0; i < 10; i++) {
    await sleep(1000)
    const portFree = await isPortFree(NEXT_PORT)
    if (portFree) {
      log('info', `Port ${NEXT_PORT} is free`)
      break
    }
  }

  // 4. Start Next.js
  try {
    const { spawn } = require('child_process')
    const child = spawn('npx', ['next', 'dev', '-p', String(NEXT_PORT)], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' },
    })

    // Don't wait for child — let it run independently
    child.unref()
    log('info', `Started Next.js with PID ${child.pid}`)
    totalRestarts++
  } catch (err) {
    log('error', `Failed to start Next.js: ${err.message}`)
  }

  // 5. Wait for health
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const result = await checkHealth()
    if (result.healthy) {
      log('ok', `Server recovered (${(i + 1) * 2}s)`)
      consecutiveFails = 0
      return true
    }
  }

  log('error', 'Server did NOT recover after 60s')
  return false
}

async function isPortFree(port) {
  try {
    const net = require('net')
    return new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port, '127.0.0.1')
    })
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Main Loop ─────────────────────────────────────────────
async function run() {
  log('info', `🐕 WATCHDOG STARTED (PID: ${process.pid})`)
  log('info', `   Health: ${HEALTH_URL} | Interval: ${CHECK_INTERVAL}s | Max fails: ${MAX_FAILS}`)

  while (true) {
    const result = await checkHealth()

    if (!result.healthy && consecutiveFails >= MAX_FAILS) {
      log('error', `❌ ${MAX_FAILS} consecutive failures — triggering restart`)
      await restartServer()
    }

    await sleep(CHECK_INTERVAL * 1000)
  }
}

// ─── Entry Point ───────────────────────────────────────────
const args = process.argv.slice(2)
if (args.includes('--once') || args.includes('-1')) {
  // Single check mode
  checkHealth().then(r => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.healthy ? 0 : 1)
  })
} else {
  // Daemon mode
  run().catch(err => {
    log('error', `Watchdog crashed: ${err.message}`)
    process.exit(1)
  })
}
