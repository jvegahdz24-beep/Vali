import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'jvegahdz24@gmail.com'
  const password = 'valiflow2026'
  
  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log('User already exists, updating password...')
    const hashed = await bcrypt.hash(password, 12)
    await prisma.user.update({ where: { email }, data: { password: hashed } })
    console.log('Password updated successfully')
    return
  }
  
  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name: 'JVega',
      email: email,
      password: hashedPassword,
      role: 'owner',
      phone: '5519842084',
      timezone: 'America/Mexico_City',
      locale: 'es-MX',
    },
  })

  const workspace = await prisma.workspace.create({
    data: {
      name: "ValiAutoFlow",
      slug: 'valiflow-jvega',
      ownerId: user.id,
      industry: 'services',
      plan: 'pro',
      maxContacts: 5000,
      maxAgents: 10,
      maxConversations: 500,
      settings: JSON.stringify({
        businessHours: 'Lun-Sab 9:00-19:00',
        timezone: 'America/Mexico_City',
        currency: 'MXN',
        defaultPersonality: 'JHON',
      }),
      members: {
        create: { userId: user.id, role: 'owner' },
      },
    },
  })

  console.log(`✅ User created: ${user.email} (ID: ${user.id})`)
  console.log(`✅ Workspace created: ${workspace.name} (ID: ${workspace.id})`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
