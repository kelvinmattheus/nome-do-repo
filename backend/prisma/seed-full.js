const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function subMonths(date, months) {
  return addMonths(date, -months);
}

async function main() {
  console.log('Limpando dados existentes...');
  await prisma.spcAgreement.deleteMany();
  await prisma.spcRecord.deleteMany();
  await prisma.basketMovement.deleteMany();
  await prisma.basketItem.deleteMany();
  await prisma.basket.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.product.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.installment.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  // ── USUÁRIOS ──────────────────────────────────────────────────────────────
  console.log('Criando usuários...');
  const hash = (pw) => bcrypt.hash(pw, 10);

  const [admin, carlos, maria] = await Promise.all([
    prisma.user.create({ data: { name: 'Administrador', email: 'admin@admin.com', passwordHash: await hash('123456'), role: 'ADMIN' } }),
    prisma.user.create({ data: { name: 'Carlos Cobrador', email: 'carlos@empresa.com', passwordHash: await hash('123456'), role: 'COLLECTOR' } }),
    prisma.user.create({ data: { name: 'Maria Cobradora', email: 'maria@empresa.com', passwordHash: await hash('123456'), role: 'COLLECTOR' } }),
  ]);

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  console.log('Criando clientes...');
  const customersData = [
    { cpf: '111.222.333-44', name: 'João da Silva', street: 'Rua das Flores', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', birthDate: new Date('1985-03-15'), phone1: '(11) 99111-2222', monthlyIncome: 3500, residenceMonths: 36, status: 'ATIVO' },
    { cpf: '222.333.444-55', name: 'Ana Oliveira', street: 'Av. Brasil', number: '456', neighborhood: 'Jardim América', city: 'São Paulo', state: 'SP', birthDate: new Date('1990-07-22'), phone1: '(11) 99222-3333', phone2: '(11) 3311-4444', monthlyIncome: 2800, residenceMonths: 24, status: 'ATIVO' },
    { cpf: '333.444.555-66', name: 'Pedro Santos', street: 'Rua Sete de Setembro', number: '789', neighborhood: 'Vila Nova', city: 'Guarulhos', state: 'SP', birthDate: new Date('1978-11-08'), phone1: '(11) 99333-4444', monthlyIncome: 4200, residenceMonths: 60, status: 'ATIVO' },
    { cpf: '444.555.666-77', name: 'Lucia Ferreira', street: 'Rua Dom Pedro', number: '321', neighborhood: 'Bom Retiro', city: 'São Paulo', state: 'SP', birthDate: new Date('1965-01-30'), phone1: '(11) 99444-5555', monthlyIncome: 2200, residenceMonths: 120, status: 'ATIVO' },
    { cpf: '555.666.777-88', name: 'Roberto Alves', street: 'Av. Paulista', number: '1000', complement: 'Apto 42', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', birthDate: new Date('1992-05-19'), phone1: '(11) 99555-6666', monthlyIncome: 5500, residenceMonths: 18, status: 'ATIVO' },
    { cpf: '666.777.888-99', name: 'Fernanda Costa', street: 'Rua Augusta', number: '250', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', birthDate: new Date('1988-09-03'), phone1: '(11) 99666-7777', monthlyIncome: 3100, residenceMonths: 30, status: 'ATIVO' },
    { cpf: '777.888.999-00', name: 'Marcos Lima', street: 'Rua XV de Novembro', number: '88', neighborhood: 'Centro', city: 'Osasco', state: 'SP', birthDate: new Date('1975-12-25'), phone1: '(11) 99777-8888', monthlyIncome: 3800, residenceMonths: 48, status: 'INADIMPLENTE' },
    { cpf: '888.999.000-11', name: 'Patrícia Rocha', street: 'Av. São João', number: '560', neighborhood: 'Campos Elíseos', city: 'São Paulo', state: 'SP', birthDate: new Date('1983-04-17'), phone1: '(11) 99888-9999', monthlyIncome: 2600, residenceMonths: 72, status: 'ATIVO' },
    { cpf: '999.000.111-22', name: 'Diego Mendes', street: 'Rua Vergueiro', number: '1500', neighborhood: 'Vila Mariana', city: 'São Paulo', state: 'SP', birthDate: new Date('1995-08-11'), phone1: '(11) 99900-1111', monthlyIncome: 4800, residenceMonths: 12, status: 'ATIVO' },
    { cpf: '000.111.222-33', name: 'Claudia Neves', street: 'Rua Oscar Freire', number: '300', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP', birthDate: new Date('1970-02-28'), phone1: '(11) 99011-2222', monthlyIncome: 6000, residenceMonths: 96, status: 'ATIVO' },
  ];

  const customers = await Promise.all(
    customersData.map(d => prisma.customer.create({ data: { ...d, zipCode: '01310-100', createdById: admin.id } }))
  );

  // ── PRODUTOS ──────────────────────────────────────────────────────────────
  console.log('Criando produtos...');
  const products = await Promise.all([
    prisma.product.create({ data: { name: 'Arroz 5kg', unit: 'sc', costPrice: 22.0, salePrice: 32.0, currentStock: 150, minStock: 20, packageUnit: 'cx', packageQty: 6 } }),
    prisma.product.create({ data: { name: 'Feijão 1kg', unit: 'pc', costPrice: 6.5, salePrice: 10.0, currentStock: 200, minStock: 30 } }),
    prisma.product.create({ data: { name: 'Óleo de Soja 900ml', unit: 'un', costPrice: 5.8, salePrice: 8.5, currentStock: 180, minStock: 25 } }),
    prisma.product.create({ data: { name: 'Açúcar Cristal 5kg', unit: 'sc', costPrice: 18.0, salePrice: 26.0, currentStock: 120, minStock: 15 } }),
    prisma.product.create({ data: { name: 'Macarrão 500g', unit: 'pc', costPrice: 3.2, salePrice: 5.0, currentStock: 300, minStock: 40 } }),
    prisma.product.create({ data: { name: 'Farinha de Trigo 5kg', unit: 'sc', costPrice: 15.0, salePrice: 22.0, currentStock: 90, minStock: 10 } }),
    prisma.product.create({ data: { name: 'Leite UHT 1L', unit: 'un', costPrice: 4.0, salePrice: 6.5, currentStock: 250, minStock: 50 } }),
    prisma.product.create({ data: { name: 'Sal 1kg', unit: 'pc', costPrice: 1.5, salePrice: 2.8, currentStock: 400, minStock: 50 } }),
  ]);

  // ── CESTAS ────────────────────────────────────────────────────────────────
  console.log('Criando cestas...');
  const cestaBasica = await prisma.basket.create({
    data: {
      name: 'Cesta Básica Padrão',
      description: 'Cesta com produtos essenciais',
      salePrice: 120.0,
      costPrice: 80.0,
      margin: 50.0,
      currentStock: 30,
      items: {
        create: [
          { productId: products[0].id, quantity: 1 },
          { productId: products[1].id, quantity: 2 },
          { productId: products[2].id, quantity: 2 },
          { productId: products[3].id, quantity: 1 },
          { productId: products[4].id, quantity: 2 },
          { productId: products[7].id, quantity: 1 },
        ]
      }
    }
  });

  const cestaFamiliar = await prisma.basket.create({
    data: {
      name: 'Cesta Familiar',
      description: 'Cesta ampliada para famílias',
      salePrice: 220.0,
      costPrice: 145.0,
      margin: 51.7,
      currentStock: 15,
      items: {
        create: [
          { productId: products[0].id, quantity: 2 },
          { productId: products[1].id, quantity: 3 },
          { productId: products[2].id, quantity: 3 },
          { productId: products[3].id, quantity: 2 },
          { productId: products[4].id, quantity: 4 },
          { productId: products[5].id, quantity: 1 },
          { productId: products[6].id, quantity: 6 },
          { productId: products[7].id, quantity: 2 },
        ]
      }
    }
  });

  // ── CONTRATOS ─────────────────────────────────────────────────────────────
  console.log('Criando contratos e parcelas...');

  async function createContract({ customer, seller, product, financedAmount, installmentCount, startDate, rate, status = 'ATIVO', paidInstallments = 0 }) {
    const contract = await prisma.contract.create({
      data: {
        customerId: customer.id,
        sellerId: seller.id,
        product,
        financedAmount,
        installmentCount,
        contractStartDate: startDate,
        interestRate: rate,
        status,
      }
    });

    const installmentAmount = parseFloat((financedAmount / installmentCount).toFixed(2));
    for (let i = 1; i <= installmentCount; i++) {
      const dueDate = addMonths(startDate, i);
      const isPaid = i <= paidInstallments;
      await prisma.installment.create({
        data: {
          contractId: contract.id,
          number: i,
          dueDate,
          amount: installmentAmount,
          paidAmount: isPaid ? installmentAmount : 0,
          status: isPaid ? 'PAGO' : (dueDate < new Date() ? 'VENCIDO' : 'PENDENTE'),
          paidAt: isPaid ? addDays(dueDate, -2) : null,
        }
      });
    }
    return contract;
  }

  const now = new Date('2026-04-01');

  const c1  = await createContract({ customer: customers[0], seller: admin, product: 'Cesta Básica Padrão', financedAmount: 480, installmentCount: 4, startDate: subMonths(now, 3), rate: 5, paidInstallments: 3 });
  const c2  = await createContract({ customer: customers[1], seller: admin, product: 'Cesta Familiar', financedAmount: 880, installmentCount: 4, startDate: subMonths(now, 2), rate: 5, paidInstallments: 2 });
  const c3  = await createContract({ customer: customers[2], seller: admin, product: 'Cesta Básica Padrão', financedAmount: 600, installmentCount: 6, startDate: subMonths(now, 5), rate: 5, paidInstallments: 5 });
  const c4  = await createContract({ customer: customers[3], seller: carlos, product: 'Cesta Básica Padrão', financedAmount: 480, installmentCount: 4, startDate: subMonths(now, 1), rate: 5, paidInstallments: 0 });
  const c5  = await createContract({ customer: customers[4], seller: carlos, product: 'Cesta Familiar', financedAmount: 1100, installmentCount: 5, startDate: subMonths(now, 4), rate: 5, paidInstallments: 3 });
  const c6  = await createContract({ customer: customers[5], seller: maria, product: 'Cesta Básica Padrão', financedAmount: 360, installmentCount: 3, startDate: subMonths(now, 2), rate: 5, paidInstallments: 2 });
  const c7  = await createContract({ customer: customers[6], seller: maria, product: 'Cesta Familiar', financedAmount: 880, installmentCount: 4, startDate: subMonths(now, 6), rate: 5, paidInstallments: 2, status: 'INADIMPLENTE' });
  const c8  = await createContract({ customer: customers[7], seller: admin, product: 'Cesta Básica Padrão', financedAmount: 480, installmentCount: 4, startDate: subMonths(now, 1), rate: 5, paidInstallments: 1 });
  const c9  = await createContract({ customer: customers[8], seller: carlos, product: 'Cesta Familiar', financedAmount: 660, installmentCount: 3, startDate: subMonths(now, 0), rate: 5, paidInstallments: 0 });
  const c10 = await createContract({ customer: customers[9], seller: admin, product: 'Cesta Básica Padrão', financedAmount: 600, installmentCount: 6, startDate: subMonths(now, 6), rate: 5, paidInstallments: 6, status: 'QUITADO' });

  // ── PAGAMENTOS ────────────────────────────────────────────────────────────
  console.log('Registrando pagamentos...');

  async function payInstallments(contract, collectorId, count) {
    const installments = await prisma.installment.findMany({
      where: { contractId: contract.id, status: 'PAGO' },
      orderBy: { number: 'asc' },
      take: count,
    });
    for (const inst of installments) {
      await prisma.payment.create({
        data: {
          contractId: contract.id,
          installmentId: inst.id,
          collectorId,
          amount: inst.amount,
          paymentDate: inst.paidAt || addDays(inst.dueDate, -1),
          paymentMethod: ['DINHEIRO', 'PIX', 'CARTÃO'][Math.floor(Math.random() * 3)],
        }
      });
    }
  }

  await payInstallments(c1, carlos.id, 3);
  await payInstallments(c2, carlos.id, 2);
  await payInstallments(c3, maria.id, 5);
  await payInstallments(c5, carlos.id, 3);
  await payInstallments(c6, maria.id, 2);
  await payInstallments(c7, carlos.id, 2);
  await payInstallments(c8, maria.id, 1);
  await payInstallments(c10, admin.id, 6);

  // ── ATRIBUIÇÕES ───────────────────────────────────────────────────────────
  console.log('Criando atribuições...');
  const contractsForCarlos = [c4, c5, c7, c9];
  const contractsForMaria  = [c6, c8];

  for (const ct of contractsForCarlos) {
    await prisma.assignment.upsert({
      where: { contractId_collectorId: { contractId: ct.id, collectorId: carlos.id } },
      update: {},
      create: { contractId: ct.id, collectorId: carlos.id, notes: 'Atribuído na abertura' }
    });
  }
  for (const ct of contractsForMaria) {
    await prisma.assignment.upsert({
      where: { contractId_collectorId: { contractId: ct.id, collectorId: maria.id } },
      update: {},
      create: { contractId: ct.id, collectorId: maria.id, notes: 'Atribuído na abertura' }
    });
  }

  // ── MOVIMENTAÇÕES DE ESTOQUE ──────────────────────────────────────────────
  console.log('Criando movimentações de estoque...');
  for (const p of products) {
    await prisma.stockMovement.create({
      data: {
        productId: p.id,
        type: 'ENTRADA',
        quantity: p.currentStock + 50,
        unitCost: p.costPrice,
        reason: 'Estoque inicial',
        userId: admin.id,
      }
    });
  }
  // saídas de contratos
  for (const [ct, qty] of [[c1, 1], [c2, 1], [c3, 1], [c4, 1], [c5, 1], [c6, 1], [c7, 1], [c8, 1], [c9, 1], [c10, 1]]) {
    await prisma.stockMovement.create({
      data: {
        productId: products[0].id,
        type: 'SAIDA',
        quantity: qty,
        salePrice: 32.0,
        margin: 45.0,
        destination: 'VENDA',
        contractId: ct.id,
        customerId: ct.customerId,
        userId: admin.id,
      }
    });
  }

  // ── SPC ───────────────────────────────────────────────────────────────────
  console.log('Criando registros SPC...');
  const spc1 = await prisma.spcRecord.create({
    data: {
      customerId: customers[6].id,
      contractId: c7.id,
      debtAmount: 440,
      originalDebt: 440,
      status: 'ATIVO',
      reason: 'Inadimplência — 4 parcelas em atraso',
      expireDate: addMonths(now, 60),
      createdById: admin.id,
    }
  });

  await prisma.spcAgreement.create({
    data: {
      spcRecordId: spc1.id,
      agreedAmount: 400,
      installments: 2,
      dueDate: addMonths(now, 1),
      status: 'PENDENTE',
      notes: 'Acordo firmado em 01/04/2026',
    }
  });

  // ── AUDIT LOGS ────────────────────────────────────────────────────────────
  console.log('Criando logs de auditoria...');
  const logs = [
    { userId: admin.id, action: 'CREATE', entityType: 'User', entityId: carlos.id, description: 'Usuário Carlos Cobrador criado' },
    { userId: admin.id, action: 'CREATE', entityType: 'User', entityId: maria.id, description: 'Usuário Maria Cobradora criado' },
    { userId: admin.id, action: 'CREATE', entityType: 'Contract', entityId: c1.id, description: `Contrato criado para ${customers[0].name}` },
    { userId: admin.id, action: 'CREATE', entityType: 'Contract', entityId: c7.id, description: `Contrato criado para ${customers[6].name}` },
    { userId: admin.id, action: 'UPDATE', entityType: 'Contract', entityId: c7.id, description: 'Status alterado para INADIMPLENTE' },
    { userId: admin.id, action: 'CREATE', entityType: 'SpcRecord', entityId: spc1.id, description: `SPC incluído para ${customers[6].name}` },
    { userId: carlos.id, action: 'CREATE', entityType: 'Payment', entityId: c1.id, description: 'Pagamento registrado — R$ 120,00' },
  ];
  await prisma.auditLog.createMany({ data: logs });

  console.log('');
  console.log('✔ Seed completo!');
  console.log('  Usuários     :', 3);
  console.log('  Clientes     :', customers.length);
  console.log('  Contratos    :', 10);
  console.log('  Produtos     :', products.length);
  console.log('  Cestas       :', 2);
  console.log('  Logs SPC     :', 1);
  console.log('');
  console.log('  Login admin     : admin@admin.com / 123456');
  console.log('  Login cobrador  : carlos@empresa.com / 123456');
  console.log('  Login cobradora : maria@empresa.com / 123456');
}

main().catch(console.error).finally(() => prisma.$disconnect());
