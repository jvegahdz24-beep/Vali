#!/bin/bash
cd /home/z/my-project/.next/standalone
export NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
exec node server.js
