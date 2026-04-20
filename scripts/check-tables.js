const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHBwdnNkdW52c21vdHhrZGl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYzNDkyNiwiZXhwIjoyMDkyMjEwOTI2fQ.Wzz9Sl6ggrsUtJkVj7UE8IYUJO89On15XJE9zhvzEQY';
const BASE = 'https://ffxppvsdunvsmotxkdiy.supabase.co';

const tables = ['User','Workspace','Contact','Conversation','Message','Agent','Deal','Pipeline','Subscription','LeadProfile','WhatsAppAuth'];

(async () => {
  console.log('Checking Supabase tables...\n');
  let exists = 0, missing = 0;
  for (const t of tables) {
    const r = await fetch(BASE + '/rest/v1/' + t + '?select=id&limit=1', {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
    });
    const status = r.status === 200 ? 'EXISTS' : 'MISSING';
    if (r.status === 200) exists++; else missing++;
    console.log('  ' + status + '  ' + t);
  }
  console.log('\n' + exists + ' exist, ' + missing + ' missing');
  if (missing === 0) console.log('ALL TABLES READY FOR DATA IMPORT!');
})();
