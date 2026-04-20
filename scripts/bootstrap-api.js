// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Bootstrap SQL via Supabase RPC
// Strategy: Create a temporary SQL function using the REST API
// ═══════════════════════════════════════════════════════════════

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHBwdnNkdW52c21vdHhrZGl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYzNDkyNiwiZXhwIjoyMDkyMjEwOTI2fQ.Wzz9Sl6ggrsUtJkVj7UE8IYUJO89On15XJE9zhvzEQY';
const BASE = 'https://ffxppvsdunvsmotxkdiy.supabase.co';

const sql = require('fs').readFileSync('/home/z/my-project/download/supabase-migration-complete.sql', 'utf-8');

// Split SQL into chunks and execute each as a separate statement
// via INSERT operations on existing tables (which we'll verify first)
async function bootstrap() {
  console.log('=== Step 1: Check if we can access the database at all ===');
  
  // Check if 'User' table already exists
  const checkTables = ['User', 'Account', 'Workspace', 'Contact'];
  for (const table of checkTables) {
    const r = await fetch(BASE + '/rest/v1/' + table + '?select=id&limit=1', {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
    });
    const status = r.status;
    console.log(table + ':', status === 200 ? 'EXISTS' : status === 404 ? 'NOT FOUND' : 'ERROR ' + status);
    if (status === 200) {
      const data = await r.json();
      console.log('  -> Rows:', data.length);
    }
  }

  console.log('\n=== Step 2: Try creating a simple table via REST (POST) ===');
  // In PostgREST, POSTing to a non-existent table should fail with a clear error
  // but some Supabase configs allow auto-creation
  try {
    const r = await fetch(BASE + '/rest/v1/User', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: 'test-connection-check',
        email: 'test@test.com',
        name: 'Test',
        role: 'member',
        timezone: 'America/Mexico_City',
        locale: 'es-MX',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    console.log('POST User:', r.status, await r.text().then(t => t.substring(0, 100)));
  } catch (e) {
    console.log('POST User error:', e.message);
  }
}

bootstrap();
