#!/bin/bash
cd /home/z/my-project || exit 1

# Load .env file and export all variables
set -a
source .env
set +a

# Copy static files
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null

while true; do
  # Only start if port 3000 is not in use
  if ! ss -tlnp 2>/dev/null | grep -q ":3000 "; then
    echo "$(date): Starting server..." >> /home/z/my-project/server.log
    (
      setsid \
        HOSTNAME=0.0.0.0 \
        NODE_ENV=production \
        DATABASE_URL="$DATABASE_URL" \
        DIRECT_URL="$DIRECT_URL" \
        NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
        NEXTAUTH_URL="$NEXTAUTH_URL" \
        NEXT_PUBLIC_APP_NAME="$NEXT_PUBLIC_APP_NAME" \
        NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
        WHATSAPP_AUTH_DIR="$WHATSAPP_AUTH_DIR" \
        ZAI_API_KEY="$ZAI_API_KEY" \
        NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
        SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
        GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
        GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
        bun .next/standalone/server.js >> /home/z/my-project/server.log 2>&1 &
    ) &
    sleep 5
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
      echo "$(date): Server started successfully" >> /home/z/my-project/server.log
    else
      echo "$(date): Server failed to start" >> /home/z/my-project/server.log
    fi
  fi
  sleep 10
done
