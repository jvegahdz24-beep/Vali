#!/usr/bin/env node
// Carga inventario de autos de prueba + activa catálogo + industry=automotive.
// Usage: node scripts/seed-automotive-demo.mjs [workspaceId]
import { readFileSync } from 'fs'
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i < 0) continue
  const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}
const WS = process.argv[2] || 'cmoxmoiq400022rag7gn8u186' // AMAD

const CARS = [
  { name: 'Hyundai Creta 2024 Limited', price: 429000, category: 'Nuevo', stock: 3, meta: { year: '2024', color: 'Cosmic Gray', km: '0', transmision: 'Automática', combustible: 'Gasolina' } },
  { name: 'Nissan Versa 2024 Advance', price: 345000, category: 'Nuevo', stock: 5, meta: { year: '2024', color: 'Blanco Perla', km: '0', transmision: 'Automática (CVT)', combustible: 'Gasolina' } },
  { name: 'Mazda CX-5 2024 Grand Touring', price: 695000, category: 'Nuevo', stock: 2, meta: { year: '2024', color: 'Azul Eterno', km: '0', transmision: 'Automática', combustible: 'Gasolina' } },
  { name: 'Toyota Hilux 2023 SR', price: 620000, category: 'Seminuevo', stock: 1, meta: { year: '2023', color: 'Plata Metálico', km: '28,000', transmision: 'Manual', combustible: 'Diésel' } },
  { name: 'KIA Rio 2022 LX', price: 265000, category: 'Seminuevo', stock: 1, meta: { year: '2022', color: 'Rojo', km: '41,000', transmision: 'Automática', combustible: 'Gasolina' } },
  { name: 'Chevrolet Aveo 2021 LT', price: 215000, category: 'Seminuevo', stock: 2, meta: { year: '2021', color: 'Gris Grafito', km: '55,000', transmision: 'Manual', combustible: 'Gasolina' } },
]

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
try {
  const ws = await db.workspace.findUnique({ where: { id: WS }, select: { id: true, name: true } })
  if (!ws) { console.log('Workspace no encontrado:', WS); process.exit(1) }

  // 1) industry → automotive
  await db.workspace.update({ where: { id: WS }, data: { industry: 'automotive' } })

  // 2) activar módulo catálogo
  await db.workspaceModule.upsert({
    where: { workspaceId_moduleType: { workspaceId: WS, moduleType: 'catalog' } },
    update: { enabled: true },
    create: { workspaceId: WS, moduleType: 'catalog', enabled: true, config: JSON.stringify({ currency: 'MXN', showPrices: true }) },
  })

  // 3) cargar autos (sin duplicar por nombre)
  let created = 0, skipped = 0
  for (const c of CARS) {
    const exists = await db.catalogItem.findFirst({ where: { workspaceId: WS, name: c.name }, select: { id: true } })
    if (exists) { skipped++; continue }
    await db.catalogItem.create({
      data: {
        workspaceId: WS, name: c.name, price: c.price, currency: 'MXN',
        category: c.category, stock: c.stock, isActive: true,
        description: `${c.meta.year} · ${c.meta.color} · ${c.meta.transmision} · ${c.meta.combustible}${c.meta.km !== '0' ? ` · ${c.meta.km} km` : ''}`,
        metadata: JSON.stringify(c.meta),
      },
    })
    created++
  }
  console.log(`✅ ${ws.name}: industry=automotive, catálogo ON, autos creados=${created}, ya existían=${skipped}`)
} finally { await db.$disconnect() }
