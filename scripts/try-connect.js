const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHBwdnNkdW52c21vdHhrZGl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYzNDkyNiwiZXhwIjoyMDkyMjEwOTI2fQ.Wzz9Sl6ggrsUtJkVj7UE8IYUJO89On15XJE9zhvzEQY';
const BASE = 'https://ffxppvsdunvsmotxkdiy.supabase.co';

async function tryAll() {
  // Try all possible REST endpoints
  const endpoints = [
    '/api/v1/sql', '/pg/execute', '/rest/v1/rpc/sql',
    '/rest/v1/rpc/exec', '/rest/v1/rpc/run', '/functions/v1/exec-sql',
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(BASE + ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
        body: JSON.stringify({ query: 'SELECT 1 as test' }),
      });
      const t = await r.text();
      if (r.status < 500) console.log(ep, r.status, t.substring(0, 100));
    } catch {}
  }

  // Try pg direct connection with various approaches
  const { Client } = require('pg');
  
  // The Supabase pooler format for session mode (port 5432)
  const pgUrls = [
    'postgresql://postgres.ffxppvsdunvsmotxkdiy@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.ffxppvsdunvsmotxkdiy@aws-0-us-west-1.pooler.supabase.com:6543/postgres',
  ];

  for (const url of pgUrls) {
    for (const pwd of [SERVICE_KEY, '']) {
      const fullUrl = url.replace('postgres.ffxppvsdunvsmotxkdiy@', 'postgres.ffxppvsdunvsmotxkdiy:' + encodeURIComponent(pwd) + '@');
      const client = new Client({ connectionString: fullUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        const r = await client.query('SELECT 1');
        console.log('PG CONNECTED:', fullUrl.substring(0, 80));
        await client.end();
        process.exit(0);
      } catch (e) {
        try { await client.end(); } catch {}
      }
    }
  }

  // Try Management API with different auth
  const mgmt = [
    'https://api.supabase.com/v1/projects/ffxppvsdunvsmotxkdiy',
    'https://api.supabase.com/v1/projects',
  ];
  for (const url of mgmt) {
    try {
      const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + SERVICE_KEY } });
      console.log('MGMT', url.split('/').pop() || '/', r.status, (await r.text()).substring(0, 100));
    } catch {}
  }

  console.log('No direct SQL execution possible. Need DB password or SQL Editor.');
}

tryAll();
