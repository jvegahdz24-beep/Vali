const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Show pipelines and where their deals' workspaceIds point
  const pipelines = await db.pipeline.findMany({
    include: {
      workspace: { select: { name: true } },
      stages: {
        include: {
          deals: { select: { id: true, title: true, workspaceId: true, stageId: true } }
        }
      }
    }
  })

  console.log('\n═══ PIPELINES & DEALS ═══')
  for (const p of pipelines) {
    const allDeals = p.stages.flatMap(s => s.deals)
    console.log(`\nPipeline: "${p.name}" | ws: ${p.workspace.name} | stages: ${p.stages.length} | deals in stages: ${allDeals.length}`)
    for (const s of p.stages) {
      if (s.deals.length > 0) {
        console.log(`  Stage "${s.name}": ${s.deals.length} deal(s)`)
        for (const d of s.deals) {
          const ok = d.workspaceId === p.workspaceId
          console.log(`    ${ok ? '✅' : '❌'} "${d.title}" | deal.ws=${d.workspaceId} | pipeline.ws=${p.workspaceId}`)
        }
      }
    }
  }

  // Get the ValiAutoFlow pipeline stage IDs so we can reassign deals
  console.log('\n═══ VALIFLOW PIPELINE STAGES ═══')
  const valiPipeline = await db.pipeline.findFirst({
    where: { workspace: { slug: 'valiflow-jvega' } },
    include: { stages: { orderBy: { order: 'asc' } } }
  })
  if (valiPipeline) {
    console.log(`Pipeline: ${valiPipeline.name} (${valiPipeline.id})`)
    for (const s of valiPipeline.stages) {
      console.log(`  Stage: ${s.name} (${s.id}) order=${s.order}`)
    }
  }

  // List the 3 mismatched deals
  console.log('\n═══ MISMATCHED DEALS DETAIL ═══')
  const mismatchedDealIds = [
    'cmp5sjie400202rb0qi2ug6s6',
    'cmp7wbgbd00322rz46vnv760m',
    'cmp7zo7uh00a02rz4cl2umbbu'
  ]
  const mismatchedDeals = await db.deal.findMany({
    where: { id: { in: mismatchedDealIds } },
    include: {
      stage: { include: { pipeline: { include: { workspace: { select: { name: true } } } } } },
      contact: { select: { firstName: true, lastName: true } }
    }
  })
  for (const d of mismatchedDeals) {
    console.log(`\nDeal: "${d.title}"`)
    console.log(`  deal.workspaceId: ${d.workspaceId}`)
    console.log(`  stage: ${d.stage.name} | pipeline: ${d.stage.pipeline.name} | pipeline.ws: ${d.stage.pipeline.workspace.name}`)
    console.log(`  contact: ${d.contact ? d.contact.firstName + ' ' + d.contact.lastName : 'none'}`)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
