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

async function readResponse(label, res) {
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }
  console.log(`[Cron] ✅ ${label} HTTP ${res.status}:`, JSON.stringify(data))
  return data
}

async function callWorker() {
  if (!WORKER_KEY) {
    throw new Error('WORKER_KEY not set — follow-up worker cannot run')
  }
  try {
    const res = await fetch(`${BASE_URL}/api/followups/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-key': WORKER_KEY,
      },
    })
    await readResponse('followups/worker', res)
  } catch (err) {
    console.error('[Cron] ❌ followups/worker error:', err.message)
    throw err
  }
}

async function callEngineCron() {
  if (!CRON_SECRET) {
    throw new Error('CRON_SECRET not set — engine cron cannot run')
  }
  try {
    const res = await fetch(`${BASE_URL}/api/engine/cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    })
    await readResponse('engine/cron', res)
  } catch (err) {
    console.error('[Cron] ❌ engine/cron error:', err.message)
    throw err
  }
}

async function callAutomationCron() {
  if (!CRON_SECRET) {
    throw new Error('CRON_SECRET not set — automation cron cannot run')
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cron/automations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    })
    await readResponse('cron/automations', res)
  } catch (err) {
    console.error('[Cron] ❌ cron/automations error:', err.message)
    throw err
  }
}

// Appointment reminders + missed-appointment handling + hot/stale-lead alerts.
// Uses ?steps=alerts so it does NOT re-process follow-up tasks (callWorker does).
async function callAppointmentAlerts() {
  if (!CRON_SECRET) {
    throw new Error('CRON_SECRET not set — appointment alerts cannot run')
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cron/follow-ups?steps=alerts`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    })
    await readResponse('follow-ups?steps=alerts', res)
  } catch (err) {
    console.error('[Cron] ❌ appointment alerts error:', err.message)
    throw err
  }
}

// Bot de marketing: publica en redes en horarios óptimos. La ruta se
// autorregula (horario óptimo + límite diario), así que es seguro llamarla
// cada 5 min para todos los workspaces con el bot habilitado.
async function callMarketingBot() {
  if (!CRON_SECRET) {
    throw new Error('CRON_SECRET not set — marketing bot cannot run')
  }
  try {
    const res = await fetch(`${BASE_URL}/api/marketing/bot/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: '{}',
    })
    await readResponse('marketing/bot/run', res)
  } catch (err) {
    console.error('[Cron] ❌ marketing/bot/run error:', err.message)
    throw err
  }
}

async function main() {
  console.log(`[Cron] 🕐 Starting automation workers at ${new Date().toISOString()}`)
  const results = await Promise.allSettled([
    callWorker(),
    callEngineCron(),
    callAutomationCron(),
    callAppointmentAlerts(),
    callMarketingBot(),
  ])
  const failures = results.filter((result) => result.status === 'rejected')
  for (const failure of failures) {
    console.error('[Cron] ❌ task failed:', failure.reason)
  }
  console.log(`[Cron] 🏁 Done at ${new Date().toISOString()} (${failures.length} failures)`)
  process.exitCode = failures.length > 0 ? 1 : 0
}

main().catch((error) => {
  console.error('[Cron] ❌ fatal error:', error)
  process.exitCode = 1
})
