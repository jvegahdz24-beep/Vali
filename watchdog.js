const { spawn } = require('child_process');
const path = require('path');

const cwd = '/home/z/my-project';
const serverScript = path.join(cwd, '.next/standalone/server.js');

function startServer() {
  const child = spawn(process.execPath, [serverScript], {
    cwd: path.join(cwd, '.next/standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=2048',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));

  child.on('exit', (code, signal) => {
    console.log(`[watchdog] Server exited: code=${code} signal=${signal}. Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    console.error(`[watchdog] Spawn error:`, err.message);
    setTimeout(startServer, 3000);
  });
}

console.log('[watchdog] Starting ValiAutoFlow server watchdog...');
startServer();
