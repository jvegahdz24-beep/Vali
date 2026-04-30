const http = require('http');
const https = require('https');

const NEXT_PORT = 3001;
const PROXY_PORT = 3000;

const proxy = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: NEXT_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Next.js backend starting up... Please retry in a moment.');
  });
  
  req.pipe(proxyReq);
});

proxy.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Proxy keep-alive on port ${PROXY_PORT} -> Next.js on ${NEXT_PORT}`);
});

// Self-ping every 5 seconds to stay alive
setInterval(() => {
  http.get(`http://127.0.0.1:${PROXY_PORT}/api/health`, (res) => {
    res.resume();
  }).on('error', () => {});
}, 5000);
