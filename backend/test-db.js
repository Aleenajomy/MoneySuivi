const prisma = require('./lib/prisma');
async function main() {
  const emis = await prisma.eMI.findMany({
    include: { payments: true }
  });
  console.log(JSON.stringify(emis, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
