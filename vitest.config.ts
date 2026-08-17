import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [],
    env: {
      NEXTAUTH_SECRET: 'test-secret-for-vitest-32-characters-long',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: 'mysql://test:test@127.0.0.1:1/test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/app/api/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/app/api/seed/**', 'src/lib/skills/**', 'node_modules'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
