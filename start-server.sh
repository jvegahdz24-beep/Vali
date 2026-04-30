#!/bin/bash
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NEXTAUTH_SECRET="dev-secret-do-not-use-in-prod-32chars!!"
export DEMO_EMAIL="jvegahdz24@gmail.com"
export DEMO_PASSWORD="valiflow2026"
export PORT=3000
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"
exec node .next/standalone/server.js
