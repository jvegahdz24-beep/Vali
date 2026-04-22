#!/bin/bash
cd /home/z/my-project || exit 1
set -a
source .env
set +a
exec bun run dev
