const { spawn } = require('child_process');
const path = require('path');

function startServer() {
  const child = spawn(process.execPath, [
    '--require', path.join('/home/z/my-project', '.next/standalone/_env-fix.js'),
    path.join('/home/z/my-project', '.next/standalone/server.js')
  ], {
    cwd: '/home/z/my-project',
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));
  child.on('exit', (code) => {
    console.log(`[${new Date().toISOString()}] Exited (${code}), restarting...`);
    setTimeout(startServer, 3000);
  });
  child.on('error', () => setTimeout(startServer, 3000));
}
startServer();
