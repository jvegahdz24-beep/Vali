// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Verification Store
// Database-backed store for pending registrations + email codes
// Uses MySQL via Prisma for persistence across restarts (VULN-016)
// TTL: 10 minutes per entry
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

export interface PendingRegistration {
  name: string
  email: string
  hashedPassword: string
  code: string
  expiresAt: number   // Unix ms
  attempts: number    // max 5 incorrect attempts
}

export async function setPending(email: string, data: Omit<PendingRegistration, 'attempts'>): Promise<void> {
  const key = email.toLowerCase()
  await db.emailVerification.upsert({
    where: { email: key },
    update: {
      name: data.name,
      hashedPassword: data.hashedPassword,
      code: data.code,
      expiresAt: new Date(data.expiresAt),
      attempts: 0,
    },
    create: {
      email: key,
      name: data.name,
      hashedPassword: data.hashedPassword,
      code: data.code,
      expiresAt: new Date(data.expiresAt),
    },
  })
}

export async function getPending(email: string): Promise<PendingRegistration | undefined> {
  const key = email.toLowerCase()
  // Clean up expired entries opportunistically
  await db.emailVerification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  const record = await db.emailVerification.findUnique({ where: { email: key } })
  if (!record) return undefined
  return {
    name: record.name,
    email: record.email,
    hashedPassword: record.hashedPassword,
    code: record.code,
    expiresAt: record.expiresAt.getTime(),
    attempts: record.attempts,
  }
}

export async function incrementAttempts(email: string): Promise<void> {
  const key = email.toLowerCase()
  await db.emailVerification.update({
    where: { email: key },
    data: { attempts: { increment: 1 } },
  })
}

export async function deletePending(email: string): Promise<void> {
  const key = email.toLowerCase()
  await db.emailVerification.deleteMany({ where: { email: key } })
}
