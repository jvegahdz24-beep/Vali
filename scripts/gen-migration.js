// Generate complete Supabase migration SQL (DDL + data)
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('download/sqlite-data-export.json', 'utf-8'));
const prismaSQL = fs.readFileSync('download/schema-prisma.sql', 'utf-8');

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function convertTimestamp(val) {
  if (!val) return 'NULL';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'NULL';
  return "'" + d.toISOString() + "'";
}

const timestampFields = new Set([
  'createdAt', 'updatedAt', 'emailVerified', 'expires',
  'lastMessageAt', 'lastRunAt',
  'wonAt', 'lostAt', 'expectedCloseDate',
  'trialEnd', 'cancelAt', 'cancelledAt',
  'currentPeriodStart', 'currentPeriodEnd',
  'lastActiveAt', 'firstSeenAt',
  'lastReactivateAt', 'expiresAt', 'sentAt', 'scheduledAt',
]);

const importOrder = [
  'User', 'Account', 'Session', 'VerificationToken',
  'Workspace', 'WorkspaceMember',
  'Contact', 'Pipeline', 'PipelineStage',
  'Conversation', 'Message',
  'Agent', 'AgentPersona', 'AgentLog', 'AgentMemory',
  'Deal', 'FollowUpRule', 'FollowUpTask',
  'Automation', 'Subscription',
  'AnalyticsEvent', 'WebhookConfig',
  'MediaFile', 'LeadProfile', 'WhatsAppAuth',
];

let insertsSQL = '';
for (const table of importOrder) {
  const records = data[table];
  if (!records || records.length === 0) continue;

  insertsSQL += '\n-- Insert ' + table + ' (' + records.length + ' rows)\n';
  for (const record of records) {
    const keys = [];
    const values = [];
    for (const [key, val] of Object.entries(record)) {
      keys.push('"' + key + '"');
      values.push(timestampFields.has(key) ? convertTimestamp(val) : escapeSQL(val));
    }
    insertsSQL += 'INSERT INTO "' + table + '" (' + keys.join(', ') + ') VALUES (' + values.join(', ') + ') ON CONFLICT DO NOTHING;\n';
  }
}

const rlsTriggerSQL = `
-- RLS
DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY['Account','Session','VerificationToken','User','Workspace','WorkspaceMember','Contact','Conversation','Message','Agent','AgentPersona','AgentLog','AgentMemory','Pipeline','PipelineStage','Deal','FollowUpRule','FollowUpTask','Automation','Subscription','AnalyticsEvent','WebhookConfig','MediaFile','LeadProfile','WhatsAppAuth']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY "Allow all on ' || tbl || '" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW."updatedAt" = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY['User','Workspace','WorkspaceMember','Contact','Conversation','Agent','AgentPersona','AgentMemory','Pipeline','PipelineStage','Deal','FollowUpRule','Automation','Subscription','WebhookConfig','LeadProfile','WhatsAppAuth']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', tbl);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()', tbl);
  END LOOP;
END $$;
`;

const fullSQL = 'BEGIN;\n\n' + prismaSQL + '\n' + insertsSQL + '\n' + rlsTriggerSQL + '\nCOMMIT;\n';

fs.writeFileSync('download/supabase-migration-complete.sql', fullSQL);
console.log('Generated:', fullSQL.length, 'bytes,', fullSQL.split('\n').length, 'lines');
console.log('Tables with data:', Object.keys(data).length);
console.log('Total records:', Object.values(data).reduce((s, r) => s + r.length, 0));
