// NEXUS Keep-Alive Runner
// Keeps the Next.js server alive by continuously pinging it
// and auto-restarting if it crashes

const { spawn } = require('child_process');
const http = require('http');

const PING_INTERVAL = 10000; // 10 seconds
const STARTUP_WAIT = 15000;  // 15 seconds for initial compile

function ping() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/auth/me', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(0));
    req.setTimeout(5000, () => { req.destroy(); resolve(0); });
  });
}

function startServer() {
  const timestamp = new Date().toISOString();
  console.log('[' + timestamp + '] Starting Next.js dev server...');
  
  const child = spawn('npx', ['next', 'dev', '-p', '3000', '--webpack'], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  child.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[SERVER]', msg);
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error('[SERVER ERR]', msg);
  });

  child.on('exit', (code) => {
    const timestamp = new Date().toISOString();
    console.log('[' + timestamp + '] Server exited with code ' + code + '. Restarting in 5s...');
    setTimeout(startServer, 5000);
  });

  return child;
}

async function main() {
  console.log('=== NEXUS AI Keep-Alive Runner ===');
  
  let server = startServer();
  
  // Initial wait for server to compile and start
  console.log('Waiting ' + (STARTUP_WAIT/1000) + 's for initial compilation...');
  await new Promise(r => setTimeout(r, STARTUP_WAIT));
  
  // Continuous ping loop
  while (true) {
    try {
      const status = await ping();
      const alive = server.exitCode === null;
      const timestamp = new Date().toISOString();
      
      if (!alive) {
        console.log('[' + timestamp + '] Server process dead. Restarting...');
        server = startServer();
        await new Promise(r => setTimeout(r, STARTUP_WAIT));
      } else if (status === 0) {
        console.log('[' + timestamp + '] Server not responding. Pinging...');
      } else {
        console.log('[' + timestamp + '] Server healthy (HTTP ' + status + ')');
      }
    } catch (err) {
      console.error('Ping error:', err.message);
    }
    
    await new Promise(r => setTimeout(r, PING_INTERVAL));
  }
}

main().catch(console.error);
