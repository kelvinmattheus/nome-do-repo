const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@admin.com';
  const collectorEmail = 'cobrador@empresa.com';
  const adminHash = await bcrypt.hash('123456', 10);
  const collectorHash = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Administrador', email: adminEmail, passwordHash: adminHash, role: 'ADMIN' }
  });

  await prisma.user.upsert({
    where: { email: collectorEmail },
    update: {},
    create: { name: 'Cobrador Padrão', email: collectorEmail, passwordHash: collectorHash, role: 'COLLECTOR' }
  });

  console.log('Seed concluído.');
}

main().finally(() => prisma.$disconnect());
