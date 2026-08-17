/**
 * Fix: Move 3 deals from wrong-workspace pipeline stages to ValiAutoFlow's correct stages
 * 
 * Problem: 3 deals have deal.workspaceId = ValiAutoFlow BUT stageId points to
 * stages in ALEJANDRO or Viridiana pipelines.
 */

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const VALI_PIPELINE_ID = 'cmoxeuptn001z2rbslj2zg2ae'
  const STAGES = {
    leadNuevo:    'cmoxeuptn00202rbsvlll7aew',
    contactado:   'cmoxeuptn00212rbs1c98jm4g',
    cualificado:  'cmoxeuptn00222rbsa8mdlogo',
    propuesta:    'cmoxeuptn00232rbslaemroau',
    negociacion:  'cmoxeuptn00242rbs6qa7acoa',
    cerradoGanado:'cmoxeuptn00252rbs9gvxzxl7',
    cerradoPerdido:'cmoxeuptn00262rbs6ipq2y1g',
  }

  const fixes = [
    {
      id: 'cmp5sjie400202rb0qi2ug6s6',
      title: 'Jonathan Vega — Lead WhatsApp',
      stageId: STAGES.leadNuevo,
      stageName: 'Lead Nuevo',
    },
    {
      id: 'cmp7wbgbd00322rz46vnv760m',
      title: 'Jonathan Vega — Versa',
      stageId: STAGES.propuesta,
      stageName: 'Propuesta',
    },
    {
      id: 'cmp7zo7uh00a02rz4cl2umbbu',
      title: 'Sir Luke — Lead WhatsApp',
      stageId: STAGES.leadNuevo,
      stageName: 'Lead Nuevo',
    },
  ]

  console.log('Fixing cross-workspace deal-pipeline associations...\n')

  for (const fix of fixes) {
    const deal = await db.deal.findUnique({
      where: { id: fix.id },
      include: {
        stage: {
          include: { pipeline: { include: { workspace: { select: { name: true } } } } }
        }
      }
    })

    if (!deal) {
      console.log(`❌ Deal not found: ${fix.title} (${fix.id})`)
      continue
    }

    console.log(`Fixing: "${fix.title}"`)
    console.log(`  From: stage="${deal.stage.name}" pipeline="${deal.stage.pipeline.name}" ws="${deal.stage.pipeline.workspace.name}"`)
    console.log(`  To:   stage="${fix.stageName}" pipeline="Pipeline de Ventas — ValiAutoFlow" ws="ValiAutoFlow"`)

    await db.deal.update({
      where: { id: fix.id },
      data: {
        pipelineId: VALI_PIPELINE_ID,
        stageId: fix.stageId,
      }
    })

    console.log(`  ✅ Fixed!\n`)
  }

  // Verify fix
  console.log('═══ VERIFICATION ═══')
  const allDeals = await db.deal.findMany({
    include: {
      pipeline: { select: { workspaceId: true, name: true, workspace: { select: { name: true } } } },
    },
  })
  let issues = 0
  for (const d of allDeals) {
    if (d.workspaceId !== d.pipeline.workspaceId) {
      console.log(`❌ STILL MISMATCHED: "${d.title}" deal.ws=${d.workspaceId} pipeline.ws=${d.pipeline.workspaceId}`)
      issues++
    }
  }
  if (issues === 0) {
    console.log('✅ All deals now have consistent workspace data!')
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
