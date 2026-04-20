// ═══════════════════════════════════════════════════════════════════════════
// ValiAutoFlow — Supabase Data Import via REST API
// After tables are created (via SQL Editor), this script imports all 256 records
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('download/sqlite-data-export.json', 'utf-8'));

const SUPABASE_URL = 'https://ffxppvsdunvsmotxkdiy.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHBwdnNkdW52c21vdHhrZGl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYzNDkyNiwiZXhwIjoyMDkyMjEwOTI2fQ.Wzz9Sl6ggrsUtJkVj7UE8IYUJO89On15XJE9zhvzEQY';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': 'Bearer ' + SERVICE_KEY,
  'Prefer': 'return=minimal,resolution=merge-duplicates',
};

const timestampFields = new Set([
  'createdAt', 'updatedAt', 'emailVerified', 'expires',
  'lastMessageAt', 'lastRunAt', 'wonAt', 'lostAt', 'expectedCloseDate',
  'trialEnd', 'cancelAt', 'cancelledAt',
  'currentPeriodStart', 'currentPeriodEnd',
  'lastActiveAt', 'firstSeenAt', 'lastReactivateAt', 'expiresAt', 'sentAt', 'scheduledAt',
]);

function convertRecord(record) {
  const out = {};
  for (const [key, val] of Object.entries(record)) {
    if (timestampFields.has(key) && val) {
      out[key] = new Date(val).toISOString();
    } else {
      out[key] = val;
    }
  }
  return out;
}

// Import in dependency order (parents before children)
const importOrder = [
  'User', 'Account', 'Session', 'VerificationToken',
  'Workspace', 'WorkspaceMember',
  'Contact',
  'Pipeline', 'PipelineStage',
  'Conversation', 'Message',
  'Agent', 'AgentPersona', 'AgentLog', 'AgentMemory',
  'Deal', 'FollowUpRule', 'FollowUpTask',
  'Automation', 'Subscription',
  'AnalyticsEvent', 'WebhookConfig',
  'MediaFile', 'LeadProfile', 'WhatsAppAuth',
];

async function importData() {
  console.log('📦 Importing data via Supabase REST API...\n');
  let totalImported = 0;
  let totalErrors = 0;

  for (const table of importOrder) {
    const records = data[table];
    if (!records || records.length === 0) continue;

    let imported = 0;
    let errors = 0;

    for (const record of records) {
      const converted = convertRecord(record);
      try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
          method: 'POST',
          headers,
          body: JSON.stringify(converted),
        });
        if (res.status === 201 || res.status === 200) {
          imported++;
        } else if (res.status === 409) {
          // Duplicate - already exists
          imported++;
        } else {
          const text = await res.text();
          if (errors < 2) console.log('  ⚠️ ' + table + ':', res.status, text.substring(0, 100));
          errors++;
        }
      } catch (e) {
        errors++;
      }
    }

    const status = imported > 0 ? '✅' : '❌';
    console.log(status + ' ' + table + ': ' + imported + '/' + records.length + (errors > 0 ? ' (' + errors + ' errors)' : ''));
    totalImported += imported;
    totalErrors += errors;
  }

  console.log('\n📊 Total imported:', totalImported + '/' +
    Object.values(data).reduce((s, r) => s + r.length, 0));
  if (totalErrors > 0) console.log('⚠️ Errors:', totalErrors);
  else console.log('🎉 All data imported successfully!');
}

importData();
