// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Execute SQL on Supabase
// Uses the Supabase REST API with service_role key
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ffxppvsdunvsmotxkdiy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

async function executeSQL(sql) {
  // Try the Supabase v2 SQL execution endpoint
  const endpoints = [
    '/rest/v1/rpc/exec_sql',
    '/rest/v1/rpc/run_sql',
    '/rest/v1/rpc/execute_sql',
    '/rest/v1/rpc/exec',
    '/pg/query',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(SUPABASE_URL + ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
        },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      console.log(ep, '->', res.status, text.substring(0, 200));
      if (res.ok) return true;
    } catch (e) {
      console.log(ep, '-> ERROR:', e.message);
    }
  }

  // Try Management API
  const mgmtUrl = 'https://api.supabase.com/v1/projects/ffxppvsdunvsmotxkdiy/database/query';
  try {
    const res = await fetch(mgmtUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SERVICE_KEY,
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    console.log('Management API ->', res.status, text.substring(0, 200));
    if (res.ok) return true;
  } catch (e) {
    console.log('Management API -> ERROR:', e.message);
  }

  return false;
}

// Read the SQL file
const sqlFile = path.join(__dirname, '..', 'download', 'supabase-migration-complete.sql');
const sql = fs.readFileSync(sqlFile, 'utf-8');
console.log('SQL file loaded:', sql.length, 'bytes');

// First try a simple test
console.log('\n--- Testing SQL execution ---');
executeSQL('SELECT 1 as test').then(success => {
  if (success) {
    console.log('\n✅ SQL execution works! Running full migration...');
    executeSQL(sql);
  } else {
    console.log('\n❌ Cannot execute SQL via API.');
    console.log('The SQL file is ready at: ' + sqlFile);
    console.log('Run it manually in Supabase Dashboard → SQL Editor');
  }
});
