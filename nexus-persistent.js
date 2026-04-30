// NEXUS AI — Persistent Server with Auto-Heal
// Runs Next.js dev server and auto-restarts on crash
// Built-in keep-alive pinging to prevent container idle cleanup

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

const PORT = 3000;
const PING_MS = 4000;

function isPortOpen(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '0.0.0.0');
  });
}

function pingServer() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:' + PORT + '/api/health', res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.setTimeout(3000, () => { req.destroy(); resolve(0); });
  });
}

function startNext() {
  const child = spawn('npx', ['next', 'dev', '-p', String(PORT), '--webpack'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, NODE_ENV: 'development', NODE_OPTIONS: '--max-old-space-size=2048' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', d => {
    const s = d.toString().trim();
    if (s) process.stdout.write('[NX] ' + s + '\n');
  });
  child.stderr.on('data', d => {
    const s = d.toString().trim();
    if (s) process.stderr.write('[NX] ' + s + '\n');
  });
  child.on('exit', (code, sig) => {
    process.stdout.write('[HEAL] Server died (code=' + code + ' sig=' + sig + '). Cleaning port and restarting in 5s...\n');
    // Kill anything still on the port
    const { execSync } = require('child_process');
    try { execSync('fuser -k ' + PORT + '/tcp 2>/dev/null'); } catch(e) {}
    setTimeout(startNext, 5000);
  });

  return child;
}

async function main() {
  process.stdout.write('=== NEXUS AI Persistent Server ===\n');
  process.stdout.write('Port: ' + PORT + '\n');
  process.stdout.write('PID: ' + process.pid + '\n\n');

  let server = startNext();

  // Continuous self-ping to keep container alive
  while (true) {
    await new Promise(r => setTimeout(r, PING_MS));

    const alive = server.exitCode === null;
    const open = await isPortOpen(PORT);
    const httpCode = alive ? await pingServer() : 0;

    const now = new Date().toISOString();
    if (alive && open && httpCode > 0) {
      process.stdout.write('[' + now + '] OK (HTTP ' + httpCode + ')\n');
    } else if (!alive) {
      process.stdout.write('[' + now + '] DEAD - restarting...\n');
      server = startNext();
    } else {
      process.stdout.write('[' + now + '] PORT CLOSED - restarting...\n');
      try { server.kill('SIGKILL'); } catch(e) {}
      server = startNext();
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
