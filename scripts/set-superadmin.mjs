import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()

const cmd = process.argv[2]   // 'create' | email to promote | undefined (list)
const arg2 = process.argv[3]  // password when cmd === 'create'

if (cmd === 'create') {
  // node scripts/set-superadmin.mjs create MyPassword123
  const email = 'admin@valiautoflow.com'
  const password = arg2 || 'Admin2026!'
  const hash = createHash('sha256').update(password).digest('hex')

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'superadmin', password: hash, name: 'Super Admin' },
    create: { email, name: 'Super Admin', password: hash, role: 'superadmin', emailVerified: new Date() },
  })
  console.log('\n✓ Cuenta superadmin lista:')
  console.log(`  Email    : ${user.email}`)
  console.log(`  Password : ${password}`)
  console.log(`  Rol      : ${user.role}`)
  console.log(`  ID       : ${user.id}`)
  console.log('\n→ Entra en: /login  con estas credenciales')
  console.log('→ Luego ve a: /admin\n')
} else if (cmd) {
  // promote existing user by email
  const updated = await prisma.user.update({
    where: { email: cmd },
    data: { role: 'superadmin' },
    select: { email: true, role: true },
  })
  console.log(`✓ ${updated.email} ahora tiene rol: ${updated.role}`)
} else {
  // list users
  const users = await prisma.user.findMany({ select: { email: true, role: true }, take: 20 })
  console.log('\nUsuarios registrados:')
  users.forEach(u => console.log(`  ${u.email}  →  ${u.role}`))
  console.log('\nOpciones:')
  console.log('  node scripts/set-superadmin.mjs create [password]')
  console.log('  node scripts/set-superadmin.mjs email@ejemplo.com\n')
}

await prisma.$disconnect()
