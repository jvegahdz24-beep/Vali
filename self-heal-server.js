const { spawn, execSync } = require('child_process');
const http = require('http');

const SERVER_PORT = 3000;
const PING_INTERVAL = 8000; // 8 seconds

function pingSelf() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.setTimeout(3000, () => { req.destroy(); resolve(0); });
  });
}

// Start a heartbeat endpoint server on a different port to keep container alive
const heartbeat = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ alive: true, time: new Date().toISOString() }));
});

// Start the heartbeat on port 3001
heartbeat.listen(3001, '0.0.0.0', () => {
  console.log(`[heartbeat] Health server on port 3001`);
});

// Start the Next.js server
let server = null;

function startNextServer() {
  console.log(`[${new Date().toISOString()}] Starting Next.js...`);
  
  server = spawn('npx', ['next', 'dev', '-p', String(SERVER_PORT), '--webpack'], {
    cwd: '/home/z/my-project',
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  server.on('exit', (code, signal) => {
    console.log(`[${new Date().toISOString()}] Server exited (code=${code}, signal=${signal}). Restarting in 3s...`);
    setTimeout(startNextServer, 3000);
  });
}

startNextServer();

// Keep-alive loop: ping ourselves to stay active
setInterval(async () => {
  const alive = server && server.exitCode === null;
  if (alive) {
    await pingSelf();
  }
}, PING_INTERVAL);

console.log(`[${new Date().toISOString()}] Self-heal server started`);
