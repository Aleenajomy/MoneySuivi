const prisma = require('./lib/prisma');
async function main() {
  const updated = await prisma.eMI.update({
    where: { id: 'a32415c3-dbce-468e-b1fb-44917c667881' },
    data: { interestRate: 11.5 }
  });
  console.log('UPDATED:', updated);
}
main().catch(console.error).finally(() => prisma.$disconnect());
