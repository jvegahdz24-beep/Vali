const { spawn } = require('child_process');
const http = require('http');

// Test: how long does a child process survive?
const child = spawn('node', ['-e', `
const http = require("http");
const s = http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("alive " + Date.now());
});
s.listen(3000, "0.0.0.0", () => console.log("MINIMAL SERVER READY"));
setInterval(() => console.log("tick"), 10000);
`]);

child.stdout.on('data', d => process.stdout.write('[CHILD] ' + d));
child.stderr.on('data', d => process.stderr.write('[CHILD] ' + d));
child.on('exit', (code, sig) => {
  console.log('[PARENT] Child EXIT code=' + code + ' sig=' + sig);
  // Immediately restart
  startChild();
});

function startChild() {
  console.log('[PARENT] Starting child...');
  const c = spawn('node', ['-e', `
const http = require("http");
const s = http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("alive " + Date.now());
});
s.listen(3000, "0.0.0.0", () => console.log("MINIMAL SERVER READY"));
setInterval(() => console.log("tick"), 10000);
`]);
  c.stdout.on('data', d => process.stdout.write('[CHILD] ' + d));
  c.stderr.on('data', d => process.stderr.write('[CHILD] ' + d));
  c.on('exit', (code, sig) => {
    console.log('[PARENT] Child EXIT code=' + code + ' sig=' + sig + ' - restarting in 2s');
    setTimeout(startChild, 2000);
  });
  return c;
}

console.log('[PARENT] Running PID=' + process.pid);
