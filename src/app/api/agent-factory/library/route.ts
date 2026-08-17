// ═══════════════════════════════════════════════════════════════
// Biblioteca de Empleados Digitales (App Store del Agent Factory)
// GET  ?workspaceId=            — catálogo de packs + qué está instalado
// POST {workspaceId, packId, employeeKey?} — instala el pack completo o UN empleado
// DELETE ?workspaceId=&packId=  — desinstala el pack (borra sus instancias)
// Cada instalación crea AgentInstance REALES (mismo motor de ruteo existente).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { EMPLOYEE_PACKS, packById, allEmployeesOf, buildEmployeePrompt } from '@/lib/agent-factory/employee-library'
import { invalidateAgentInstanceCache } from '@/lib/ai/agent-selector'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    // Instalados: instancias cuyo vertical es un packId (role = employee key)
    const packIds = EMPLOYEE_PACKS.map((p) => p.id)
    const installed = await db.agentInstance.findMany({
      where: { workspaceId, vertical: { in: packIds } },
      select: { id: true, role: true, vertical: true, status: true },
    })
    const installedByKey: Record<string, { id: string; status: string }> = {}
    for (const i of installed) installedByKey[i.role] = { id: i.id, status: i.status }

    const packs = EMPLOYEE_PACKS.map((p) => {
      const employees = allEmployeesOf(p)
      return {
        id: p.id, name: p.name, emoji: p.emoji, tagline: p.tagline, description: p.description,
        total: employees.length,
        installedCount: employees.filter((emp) => installedByKey[emp.key]).length,
        departments: p.departments.map((d) => ({
          name: d.name, emoji: d.emoji,
          employees: d.employees.map((emp) => ({
            key: emp.key, name: emp.name, emoji: emp.emoji, kind: emp.kind,
            summary: emp.summary, functions: emp.functions, kpis: emp.kpis,
            dependsOn: emp.dependsOn || [],
            installed: !!installedByKey[emp.key],
            instanceId: installedByKey[emp.key]?.id || null,
            status: installedByKey[emp.key]?.status || null,
          })),
        })),
      }
    })
    return NextResponse.json({ packs })
  } catch (err) { return errorResponse(err) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; packId: string; employeeKey?: string }
    await requireWorkspace(body.workspaceId, session.userId)

    const pack = packById(body.packId)
    if (!pack) return NextResponse.json({ error: 'Pack no encontrado' }, { status: 404 })

    const candidates = allEmployeesOf(pack).filter((emp) => !body.employeeKey || emp.key === body.employeeKey)
    if (candidates.length === 0) return NextResponse.json({ error: 'Empleado no encontrado en el pack' }, { status: 404 })

    // Evitar duplicados: ya instalados (por role key) se saltan
    const existing = await db.agentInstance.findMany({
      where: { workspaceId: body.workspaceId, vertical: pack.id },
      select: { role: true },
    })
    const have = new Set(existing.map((x) => x.role))
    const toInstall = candidates.filter((emp) => !have.has(emp.key))

    let created = 0
    for (const emp of toInstall) {
      await db.agentInstance.create({
        data: {
          name: emp.name,
          role: emp.key, // clave del empleado en la biblioteca
          vertical: pack.id,
          scope: `${emp.summary} · Departamento: ${emp.department} · ${emp.kind}`,
          forbiddenActions: JSON.stringify(
            emp.kind === 'backoffice'
              ? ['afirmar que ejecutó acciones en plataformas externas', 'inventar métricas']
              : emp.kind === 'analista'
                ? ['inventar cifras o tendencias']
                : ['prometer lo que el sistema no puede cumplir', 'inventar precios o inventario'],
          ),
          systemPrompt: buildEmployeePrompt(emp, pack, emp.department),
          tools: JSON.stringify([]),
          // Solo los conversacionales rutean en el pipeline (keywords/etapa);
          // analistas y backoffice no interceptan chats de clientes.
          keywords: JSON.stringify(emp.kind === 'conversacional' ? (emp.keywords || []) : []),
          stageMatch: JSON.stringify(emp.kind === 'conversacional' ? (emp.stageMatch || []) : []),
          model: 'glm-4.5-flash',
          temperature: 0.3,
          priority: emp.priority ?? (emp.kind === 'conversacional' ? 60 : 10),
          status: 'activo',
          workspaceId: body.workspaceId,
        },
      })
      created++
    }

    invalidateAgentInstanceCache(body.workspaceId)
    return NextResponse.json({ success: true, created, skipped: candidates.length - toInstall.length })
  } catch (err) { return errorResponse(err) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const packId = req.nextUrl.searchParams.get('packId') || ''
    await requireWorkspace(workspaceId, session.userId)
    if (!packById(packId)) return NextResponse.json({ error: 'Pack no encontrado' }, { status: 404 })
    const r = await db.agentInstance.deleteMany({ where: { workspaceId, vertical: packId } })
    invalidateAgentInstanceCache(workspaceId)
    return NextResponse.json({ success: true, removed: r.count })
  } catch (err) { return errorResponse(err) }
}
