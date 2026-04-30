const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== CONTACTOS ===');
  const contacts = await prisma.contact.findMany();
  console.table(contacts.map(c => ({ name: c.name, phone: c.phone, score: c.score })));

  console.log('\\n=== AGENT MEMORY ===');
  const memories = await prisma.agentMemory.findMany({
    include: { contact: { select: { name: true } } }
  });
  console.table(memories.map(m => ({ contact: m.contact.name, stage: m.stage, compra_flag: m.compra_flag, preguntas: m.preguntasEnEtapa })));

  console.log('\\n=== EVENTOS HUÉRFANOS ===');
  const analyticsCount = await prisma.analyticsEvent.count();
  const engineCount = await prisma.engineEvent.count();
  console.log(AnalyticsEvent: \ registros);
  console.log(EngineEvent: \ registros);
}

main()
  .catch(console.error)
  .finally(() => prisma.\());
