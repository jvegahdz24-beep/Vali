const { spawn } = require('child_process');
const path = require('path');

function startServer() {
  const envFixPath = path.join('/home/z/my-project', '.next/standalone/_env-fix.js');
  const serverPath = path.join('/home/z/my-project', '.next/standalone/server.js');

  const child = spawn('/usr/local/bin/bun', [
    serverPath
  ], {
    cwd: '/home/z/my-project/.next/standalone',
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: '3000',
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      WHATSAPP_AUTH_DIR: process.env.WHATSAPP_AUTH_DIR,
      ZAI_API_KEY: process.env.ZAI_API_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    }
  });

  child.stdout.on('data', d => process.stdout.write(d));
  child.stderr.on('data', d => process.stderr.write(d));
  child.on('exit', (code) => {
    console.log(`[${new Date().toISOString()}] Exited (${code}), restarting in 3s...`);
    setTimeout(startServer, 3000);
  });
  child.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
    setTimeout(startServer, 3000);
  });
}

// Load env from .env file before starting
const fs = require('fs');
const envPath = '/home/z/my-project/.env';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

startServer();
