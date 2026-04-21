#!/bin/bash
cd /home/z/my-project/.next/standalone || exit 1

# Load env from project root
set -a
source /home/z/my-project/.env
set +a

export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT=3000

exec /usr/local/bin/bun server.js
