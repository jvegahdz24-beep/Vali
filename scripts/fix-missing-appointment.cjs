// Fix: manually create the confirmed appointment for Jonathan (jueves 4 junio, 4pm)
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const convId = 'cmpk2896j00702r1kq4o5wu8p'
  const contactId = 'cmpk288y8006y2r1kfe6ihuwj'
  const workspaceId = 'cmoxeuojz000k2rbsqxsqtybm'

  // Get contact info
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { firstName: true, lastName: true }
  })
  console.log('Contact:', contact)

  // Create the appointment
  const apptDate = new Date('2026-06-04T16:00:00')
  const appt = await db.appointment.create({
    data: {
      workspaceId,
      contactId,
      title: `Llamada diagnóstico con ${contact?.firstName || 'Jonathan'} ${contact?.lastName || ''}`.trim(),
      description: 'Cita confirmada vía WhatsApp. Creada manualmente después de fix.',
      date: apptDate,
      duration: 20,
      type: 'call',
      status: 'pending',
    }
  })
  console.log('✅ Appointment created:', appt.id, appt.title, appt.date)

  // Clear the apptProposal from conversation metadata
  const conv = await db.conversation.findUnique({ where: { id: convId }, select: { metadata: true } })
  let meta = {}
  try { meta = JSON.parse(conv?.metadata || '{}') } catch {}
  delete meta.apptProposal
  await db.conversation.update({
    where: { id: convId },
    data: { metadata: JSON.stringify(meta) }
  })
  console.log('✅ Cleared apptProposal from metadata')

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
