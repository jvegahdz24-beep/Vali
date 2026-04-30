// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Global Setup
// Sets environment variables required by the app before any test runs
// ═══════════════════════════════════════════════════════════════

// Set required env vars BEFORE any module loads
// This is critical because auth-edge.ts reads NEXTAUTH_SECRET at import time
process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-prod-32chars!!'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.DATABASE_URL = 'file:./test.db'
// NODE_ENV is set by global-setup.cjs and npm test script
process.env.CRON_SECRET = 'test-cron-secret-key-12345'
process.env.WORKER_KEY = 'test-worker-key-67890'
