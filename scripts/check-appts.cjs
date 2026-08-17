const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();
db.appointment.findMany({
  where:{workspaceId:'cmoxeuojz000k2rbsqxsqtybm'},
  orderBy:{createdAt:'desc'},
  take:5
}).then(r=>console.log(JSON.stringify(r,null,2))).finally(()=>db.$disconnect());
