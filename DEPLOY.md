# ValiAutoFlow — Deployment Guide

Production-ready deployment instructions for ValiAutoFlow CRM with AI.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Build & Deploy](#build--deploy)
5. [WhatsApp Connection](#whatsapp-connection)
6. [SSL / HTTPS](#ssl--https)
7. [Scaling Considerations](#scaling-considerations)
8. [Monitoring & Logs](#monitoring--logs)
9. [Common Issues & Solutions](#common-issues--solutions)

---

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **npm** or **bun** package manager
- **SQLite** — No external server needed (database is a file)
- A Linux server (Ubuntu 22.04+ recommended) or container runtime

---

## Environment Configuration

### 1. Clone the repository

```bash
git clone <repo-url> valiautoflow
cd valiautoflow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env` from template

```bash
cp .env.example .env
```

### 4. Edit `.env` with production values

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite file path: `file:/path/to/app/db/custom.db` |
| `NEXTAUTH_URL` | ✅ | Your production URL: `https://app.yourdomain.com` |
| `NEXTAUTH_SECRET` | ✅ | Random 32+ char string. Generate: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_NAME` | Optional | App name shown in UI (default: ValiAutoFlow) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Same as `NEXTAUTH_URL` |
| `WHATSAPP_AUTH_DIR` | Optional | WhatsApp auth session directory (default: `.whatsapp-auth`) |
| `SEED_PIN` | ✅ | PIN to protect seed endpoint. Use a strong random value. |

**Critical:** `NEXTAUTH_SECRET` MUST be unique and secret. Never use the default value in production.

---

## Database Setup

ValiAutoFlow uses SQLite via Prisma ORM. No external database server needed.

### Initialize database

```bash
npx prisma db push
npx prisma generate
```

### Seed demo data (optional)

```bash
# Use the PIN from your .env
curl -X POST "https://app.yourdomain.com/api/seed?pin=YOUR_SEED_PIN"
```

This creates a demo user (`demo@valiflow.com` / `demo1234`) with sample data for the automotive sector.

### Backup database

```bash
# Simple file copy — SQLite is a single file
cp db/custom.db backups/custom-$(date +%Y%m%d-%H%M%S).db
```

---

## Build & Deploy

### Option A: Standalone Server (Recommended)

```bash
# Build
npm run build

# The build script copies static files into .next/standalone/
# Start the production server
npm run start
```

The app runs on port 3000 by default. Use a reverse proxy (nginx) for port 80/443.

### Option B: Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t valiautoflow .
docker run -p 3000:3000 \
  -e DATABASE_URL="file:/app/db/custom.db" \
  -e NEXTAUTH_URL="https://app.yourdomain.com" \
  -e NEXTAUTH_SECRET="your-secret" \
  -v ./db:/app/db \
  valiautoflow
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Allow larger uploads for WhatsApp media
    client_max_body_size 50M;
}
```

---

## WhatsApp Connection

### Setup

1. Navigate to **Configuración → WhatsApp** in the dashboard
2. Click **"Conectar WhatsApp"**
3. Scan the QR code with your WhatsApp app (linked devices)
4. The connection persists in `.whatsapp-auth/` directory

### Important Notes

- **Session persistence:** The `.whatsapp-auth/` directory contains your WhatsApp session state. **Back this up regularly.**
- **Single connection:** Only one WhatsApp connection per ValiAutoFlow instance.
- **Rate limits:** WhatsApp has message rate limits. The built-in rate limiter helps prevent issues.
- **Reconnection:** The system auto-reconnects on disconnection (up to 10 attempts with exponential backoff).
- **Media directory:** If using media features, ensure `/tmp` is writable.

### Security

- WhatsApp auth directory is in `.gitignore` (never committed)
- Set `WHATSAPP_AUTH_DIR` to a secure location outside the web root
- Consider encrypting the auth directory at rest

---

## SSL / HTTPS

**Required for production.** NextAuth.js cookies require HTTPS.

- Use **Let's Encrypt** (free): `certbot --nginx -d app.yourdomain.com`
- Or a managed certificate from your hosting provider
- WhatsApp webhooks may require HTTPS for reliable delivery

---

## Scaling Considerations

### Current Architecture (Single Instance)

- **SQLite**: Great for up to ~1,000 concurrent users. Single-file database.
- **In-memory rate limiting**: Works for single instance. Use Redis for multi-instance.
- **WhatsApp connection**: One per instance. For multi-tenant WhatsApp, use the Evolution API.

### Scaling Up

| Component | Current | Scale To |
|---|---|---|
| Database | SQLite | PostgreSQL (change `provider` in `schema.prisma`) |
| Rate Limiting | In-memory Map | Redis + `ioredis` |
| Sessions | JWT (stateless) | JWT (already scalable) |
| WhatsApp | Baileys (1 connection) | Evolution API (multi-instance) |
| File Storage | Local `.whatsapp-auth/` | S3-compatible storage |
| Cache | None | Redis |

### Database Migration to PostgreSQL

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
npm install pg @prisma/adapter-pg
npx prisma migrate dev --name init
```

---

## Monitoring & Logs

### Application Logs

```bash
# If using the start script with tee:
tail -f server.log

# Or direct output:
npm run start
```

### Health Check

The app responds to:
- `GET /` — Returns the dashboard (requires auth)
- `GET /api/seed` — Returns seed status (no auth required)

### Developer Panel

Use the built-in **Panel Dev** (Developer Panel) in the dashboard to:
- View real-time logs
- Test AI agents
- Inspect database tables
- Export data
- Monitor webhook deliveries

---

## Common Issues & Solutions

### "NEXTAUTH_SECRET not set"

**Fix:** Ensure `NEXTAUTH_SECRET` is set in `.env` and is a strong random string.

### WhatsApp QR code not appearing

**Fix:**
1. Check `.whatsapp-auth/` directory permissions (must be writable)
2. Clear old session: Delete `.whatsapp-auth/` and retry
3. Check server logs for Baileys connection errors

### "Prisma Client not generated"

**Fix:** Run `npx prisma generate` before building.

### Database locked (SQLite)

**Fix:** SQLite only supports one writer at a time. If under heavy load:
- Enable WAL mode: `PRAGMA journal_mode=WAL;`
- Or migrate to PostgreSQL

### Seed endpoint returns 403

**Fix:** The seed endpoint now requires a PIN parameter:
```bash
curl -X POST "https://app.yourdomain.com/api/seed?pin=YOUR_SEED_PIN"
```

### Rate limit errors (429)

**Fix:** Default limits:
- Auth endpoints: 10 req/min per IP
- AI chat: 20 req/min per IP
- WhatsApp send: 30 req/min per IP

Adjust `RATE_LIMITS` in `src/lib/rate-limit.ts` if needed.

### CORS issues with webhooks

**Fix:** Webhook endpoints (`/api/webhooks/*`) have CORS headers configured in `next.config.ts`. Ensure your webhook source domain is allowed.

---

## Security Checklist

- [ ] `NEXTAUTH_SECRET` is a strong random value (not the default)
- [ ] `SEED_PIN` is changed from the default
- [ ] HTTPS/SSL is configured
- [ ] `.env` is not committed to git
- [ ] `.whatsapp-auth/` is not accessible from the web
- [ ] Database file is not in a public directory
- [ ] Firewall restricts access to port 3000 (only nginx/localhost)
- [ ] Regular database backups are scheduled

---

## Support

For issues, check the Developer Panel logs or server logs first. The built-in error boundary captures and displays errors with unique IDs for tracing.
