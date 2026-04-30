// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Global Setup (Jest globalSetup)
// Sets environment variables in the actual Node.js process
// before any test modules are compiled or imported.
// ═══════════════════════════════════════════════════════════════

module.exports = async () => {
  process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-prod-32chars!!'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.NODE_ENV = 'test'
  process.env.CRON_SECRET = 'test-cron-secret-key-12345'
  process.env.WORKER_KEY = 'test-worker-key-67890'
}
