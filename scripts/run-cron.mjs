#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation Cron Runner
// Called by PM2 on a cron schedule (every 5 minutes).
// Triggers both the follow-up worker and the engine cron.
// ═══════════════════════════════════════════════════════════════

// Load .env for standalone execution (PM2 doesn't auto-load it for
// non-Next.js scripts). Use Node 20+ --env-file flag via PM2 args,
// or fall back to manual parsing here.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Parse .env manually (no external deps needed)
try {
  const envContent = readFileSync(join(ROOT, '.env'), 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env not found — rely on process environment (PM2 env config)
}

const PORT = process.env.PORT || '3105'
const BASE_URL = `http://localhost:${PORT}`
const WORKER_KEY = process.env.WORKER_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function callWorker() {
  if (!WORKER_KEY) {
    console.error('[Cron] ❌ WORKER_KEY not set — skipping follow-up worker')
    return
  }
  try {
    const res = await fetch(`${BASE_URL}/api/followups/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': WORKER_KEY,
      },
    })
    const data = await res.json()
    console.log(`[Cron] ✅ followups/worker HTTP ${res.status}:`, JSON.stringify(data))
  } catch (err) {
    console.error('[Cron] ❌ followups/worker error:', err.message)
  }
}

async function callEngineCron() {
  if (!CRON_SECRET) {
    console.error('[Cron] ❌ CRON_SECRET not set — skipping engine cron')
    return
  }
  try {
    const res = await fetch(`${BASE_URL}/api/engine/cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    })
    const data = await res.json()
    console.log(`[Cron] ✅ engine/cron HTTP ${res.status}:`, JSON.stringify(data))
  } catch (err) {
    console.error('[Cron] ❌ engine/cron error:', err.message)
  }
}

async function callAutomationCron() {
  if (!CRON_SECRET) {
    console.error('[Cron] ❌ CRON_SECRET not set — skipping automation cron')
    return
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cron/automations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    })
    const data = await res.json()
    console.log(`[Cron] ✅ cron/automations HTTP ${res.status}:`, JSON.stringify(data))
  } catch (err) {
    console.error('[Cron] ❌ cron/automations error:', err.message)
  }
}

// Appointment reminders + missed-appointment handling + hot/stale-lead alerts.
// Uses ?steps=alerts so it does NOT re-process follow-up tasks (callWorker does).
async function callAppointmentAlerts() {
  if (!CRON_SECRET) {
    console.error('[Cron] ❌ CRON_SECRET not set — skipping appointment alerts')
    return
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cron/follow-ups?steps=alerts`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    })
    const data = await res.json()
    console.log(`[Cron] ✅ follow-ups?steps=alerts HTTP ${res.status}:`, JSON.stringify(data))
  } catch (err) {
    console.error('[Cron] ❌ appointment alerts error:', err.message)
  }
}

// Bot de marketing: publica en redes en horarios óptimos. La ruta se
// autorregula (horario óptimo + límite diario), así que es seguro llamarla
// cada 5 min para todos los workspaces con el bot habilitado.
async function callMarketingBot() {
  if (!CRON_SECRET) return
  try {
    const res = await fetch(`${BASE_URL}/api/marketing/bot/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: '{}',
    })
    const data = await res.json()
    console.log(`[Cron] ✅ marketing/bot/run HTTP ${res.status}:`, JSON.stringify(data))
  } catch (err) {
    console.error('[Cron] ❌ marketing/bot/run error:', err.message)
  }
}

async function main() {
  console.log(`[Cron] 🕐 Starting automation workers at ${new Date().toISOString()}`)
  await Promise.allSettled([callWorker(), callEngineCron(), callAutomationCron(), callAppointmentAlerts(), callMarketingBot()])
  console.log(`[Cron] 🏁 Done at ${new Date().toISOString()}`)
  process.exit(0)
}

main()
