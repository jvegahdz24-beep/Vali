const http = require('http');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const HEALTH = 'http://127.0.0.1:3000/api/health';
const MAX_FAILS = 3;
const INTERVAL_MS = 60000;
const LOG = '/home/z/my-project/.watchdog.log';
let fails = 0;
let restarting = false;

function log(l, m) {
  const t = new Date().toISOString().slice(0,19);
  const line = `${t} [${l.toUpperCase()}] ${m}`;
  console.error(line); // stderr so nohup captures it
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}

function check() {
  if (restarting) return;
  const s = Date.now();
  try {
    const r = http.get(HEALTH, {timeout:8000}, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        fails = 0;
        log('ok', `Health ${res.statusCode} (${Date.now()-s}ms)`);
      });
    });
    r.on('error', e => {
      fails++;
      log('error', `FAIL: ${e.message} (${fails}/${MAX_FAILS})`);
      if (fails >= MAX_FAILS && !restarting) doRestart();
    });
    r.on('timeout', () => {
      r.destroy();
      fails++;
      log('error', `TIMEOUT (${fails}/${MAX_FAILS})`);
      if (fails >= MAX_FAILS && !restarting) doRestart();
    });
  } catch(e) {
    log('error', `Check exception: ${e.message}`);
  }
}

function doRestart() {
  restarting = true;
  log('warn', '=== RESTART ===');
  try { const p = execSync('pgrep -f next-server 2>/dev/null || true', {encoding:'utf8'}).trim(); if(p) execSync(`kill -9 ${p.replace(/\n/g,' ')} 2>/dev/null || true`); } catch {}
  try { fs.rmSync('/home/z/my-project/.next/dev/cache', {recursive:true,force:true}); } catch {}
  setTimeout(() => {
    try {
      const c = spawn('npx', ['next','dev','-p','3000'], {
        cwd:'/home/z/my-project', detached:true, stdio:'ignore',
        env:{...process.env, NODE_OPTIONS:'--max-old-space-size=2048'}
      });
      c.unref();
      log('info', `Started PID ${c.pid}`);
    } catch(e) { log('error', `Start failed: ${e.message}`); }
    // Wait then verify
    setTimeout(() => {
      restarting = false;
      log('info', 'Restart complete, resuming checks');
    }, 30000);
  }, 3000);
}

// Use setInterval to prevent GC from killing the timer
log('info', `WATCHDOG v4 STARTED (PID: ${process.pid})`);
setInterval(check, INTERVAL_MS);
check(); // Immediate first check
