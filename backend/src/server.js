require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const prisma = require('./utils/prisma');
const auth = require('./middleware/auth');
const { startOfMonth, endOfMonth, startOfDay, endOfDay } = require('./utils/date');

// Parse de data: salva como meia-noite UTC pura
// O front lê as datas em UTC (dayjs.utc) então o dia nunca recua
function parseDate(str) {
  if (!str) return null;
  const dateOnly = str.split('T')[0]; // garante só YYYY-MM-DD
  return new Date(dateOnly + 'T00:00:00.000Z');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Helper PDF: desenha tabela com paginação automática ──────────
function pdfDrawTable(doc, headers, rows, colWidths, options = {}) {
  const { x = 40, rowHeight = 20, fontSize = 8 } = options;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - rowHeight;

  const drawHeader = (y) => {
    doc.rect(x, y, totalWidth, rowHeight).fill('#1877f2');
    let xp = x;
    headers.forEach((h, i) => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff')
        .text(h, xp + 4, y + 6, { width: colWidths[i] - 8, lineBreak: false });
      xp += colWidths[i];
    });
    doc.fillColor('#000000');
  };

  let curY = doc.y;
  drawHeader(curY);
  curY += rowHeight;

  rows.forEach((row, ri) => {
    if (curY > bottomLimit) {
      doc.addPage();
      curY = doc.page.margins.top;
      drawHeader(curY);
      curY += rowHeight;
    }
    const bg = ri % 2 === 0 ? '#f8faff' : '#ffffff';
    doc.rect(x, curY, totalWidth, rowHeight).fill(bg).stroke('#e2e8f0');
    let xp = x;
    row.forEach((cell, ci) => {
      doc.font('Helvetica').fontSize(fontSize).fillColor('#1e293b')
        .text(String(cell ?? ''), xp + 4, curY + 6, { width: colWidths[ci] - 8, lineBreak: false });
      xp += colWidths[ci];
    });
    curY += rowHeight;
  });

  doc.y = curY + 4;
}

const cpfRegex = /^\d{11}$/;
const brPhoneRegex = /^\d{10,11}$/;

function calcContractTotal(contract) {
  const interestFactor = 1 + Number(contract.interestRate || 0) / 100;
  return Number((Number(contract.financedAmount || 0) * interestFactor).toFixed(2));
}

function signUser(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function normalizeInstallmentStatus(installment) {
  const today = new Date();
  const fullyPaid = Number(installment.paidAmount || 0) >= Number(installment.amount || 0);

  if (fullyPaid) return 'PAGA';
  if (Number(installment.paidAmount || 0) > 0) return 'PARCIAL';
  if (new Date(installment.dueDate) < today) return 'ATRASADA';
  return 'PENDENTE';
}

function normalizeContractStatus(contractLike) {
  const installments = contractLike.installments || [];
  if (!installments.length) return 'ATIVO';

  const allPaid = installments.every(
    (i) => Number(i.paidAmount || 0) >= Number(i.amount || 0)
  );
  if (allPaid) return 'QUITADO';

  const anyOverdue = installments.some((i) => normalizeInstallmentStatus(i) === 'ATRASADA');
  if (anyOverdue) return 'ATRASADO';

  return 'ATIVO';
}

function buildInstallments(contractStartDate, installmentCount, totalValue) {
  const amount = Number((totalValue / installmentCount).toFixed(2));
  const installments = [];

  for (let i = 1; i <= installmentCount; i += 1) {
    const dueDate = new Date(contractStartDate);
    // Parcela 1 = 30 dias após início, parcela 2 = 60 dias, etc.
    dueDate.setMonth(dueDate.getMonth() + i);

    installments.push({
      number: i,
      dueDate,
      amount:
        i === installmentCount
          ? Number((totalValue - amount * (installmentCount - 1)).toFixed(2))
          : amount
    });
  }

  return installments;
}

async function writeAuditLog({
  userId = null,
  action,
  entityType,
  entityId,
  description = '',
  metadata = null
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });
  } catch (error) {
    console.error('Falha ao gravar auditoria:', error.message);
  }
}

async function enrichContract(contract) {
  const totalWithInterest = calcContractTotal(contract);
  const paidAmount = Number(
    (contract.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)
  );
  const pendingAmount = Number(Math.max(totalWithInterest - paidAmount, 0).toFixed(2));

  const normalizedInstallments = (contract.installments || []).map((i) => ({
    ...i,
    status: normalizeInstallmentStatus(i)
  }));

  const paidInstallments = normalizedInstallments.filter((i) => i.status === 'PAGA').length;
  const partialInstallments = normalizedInstallments.filter((i) => i.status === 'PARCIAL').length;
  const overdueInstallments = normalizedInstallments.filter((i) => i.status === 'ATRASADA').length;
  const remainingInstallments = normalizedInstallments.filter((i) => i.status !== 'PAGA').length;

  return {
    ...contract,
    status: normalizeContractStatus({ installments: normalizedInstallments }),
    installments: normalizedInstallments,
    totalWithInterest,
    paidAmount,
    pendingAmount,
    paidInstallments,
    partialInstallments,
    overdueInstallments,
    remainingInstallments
  };
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','))
  ].join('\n');
}

function moneyLike(value) {
  return Number(value || 0).toFixed(2);
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/setup-admin', async (req, res) => {
  try {
    const key = req.headers['x-setup-key'];
    if (key !== process.env.SETUP_ADMIN_KEY) {
      return res.status(403).json({ message: 'Setup key inválida.' });
    }

    const schema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(6)
    });

    const data = schema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {
        name: data.name,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'ADMIN',
        isActive: true
      }
    });

    await writeAuditLog({
      userId: user.id,
      action: 'SETUP_ADMIN',
      entityType: 'USER',
      entityId: user.id,
      description: 'Administrador inicial criado ou atualizado.'
    });

    const token = signUser(user);
    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao criar administrador.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6)
    });
    const data = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }

    const token = signUser(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao efetuar login.' });
  }
});

app.get('/auth/me', auth(), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.get('/users', auth(['ADMIN']), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });
  res.json(users);
});


app.get('/collectors', auth(['ADMIN']), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'COLLECTOR', isActive: true },
    select: { id: true, name: true, email: true }
  });
  res.json(users);
});

app.post('/users', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'COLLECTOR']),
      isActive: z.boolean().optional().default(true)
    });

    const data = schema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        isActive: data.isActive
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'CREATE',
      entityType: 'USER',
      entityId: user.id,
      description: `Usuário ${user.name} criado.`,
      metadata: { email: user.email, role: user.role }
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao criar usuário.' });
  }
});

app.put('/users/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
      role: z.enum(['ADMIN', 'COLLECTOR']),
      isActive: z.boolean(),
      password: z.string().min(6).optional().or(z.literal(''))
    });

    const data = schema.parse(req.body);
    const updateData = {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
      updatedAt: new Date()
    };

    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: user.id,
      description: `Usuário ${user.name} atualizado.`
    });

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao atualizar usuário.' });
  }
});

app.delete('/users/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'DELETE',
      entityType: 'USER',
      entityId: req.params.id,
      description: 'Usuário excluído.'
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao excluir usuário.' });
  }
});

app.get('/customers', auth(), async (req, res) => {
  const q = req.query.q?.toString() || '';
  const status = req.query.status?.toString() || '';

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { cpf: { contains: q } },
            { phone1: { contains: q } },
            { phone2: { contains: q } },
            { city: { contains: q } },
            { neighborhood: { contains: q } }
          ]
        }
      : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  res.json(customers);
});

app.get('/customers/:id/full', auth(), async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        contracts: {
          include: {
                  installments: { orderBy: { number: 'asc' } },
            payments: {
              include: {
                collector: { select: { id: true, name: true, email: true } },
                installment: true
              },
              orderBy: { paymentDate: 'desc' }
            },
            assignments: {
              include: {
                collector: { select: { id: true, name: true, email: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!customer) return res.status(404).json({ message: 'Cliente não encontrado.' });


    const enrichedContracts = await Promise.all(customer.contracts.map(enrichContract));

    const timeline = [];

    for (const contract of enrichedContracts) {
      timeline.push({
        type: 'CONTRATO',
        date: contract.createdAt,
        title: `Contrato criado - ${contract.product}`,
        description: `Contrato com ${contract.installmentCount} parcelas e saldo ${moneyLike(contract.pendingAmount)}`
      });

      for (const payment of contract.payments) {
        timeline.push({
          type: 'PAGAMENTO',
          date: payment.paymentDate,
          title: 'Pagamento registrado',
          description: `Valor ${moneyLike(payment.amount)}${payment.installment ? ` - Parcela ${payment.installment.number}` : ''}`
        });
      }

      for (const assignment of contract.assignments) {
        timeline.push({
          type: 'DISTRIBUICAO',
          date: assignment.assignedAt,
          title: 'Cliente distribuído',
          description: `Direcionado para ${assignment.collector.name}`
        });
      }
    }

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      customer: {
        ...customer,
        contracts: enrichedContracts
      },
      timeline
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao carregar ficha do cliente.' });
  }
});

app.post('/customers', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      cpf: z.string().regex(cpfRegex, 'CPF deve conter 11 dígitos.'),
      name: z.string().min(3),
      zipCode: z.string().optional().nullable(),
      street: z.string().min(3),
      number: z.string().min(1),
      complement: z.string().optional().nullable(),
      neighborhood: z.string().min(2),
      city: z.string().min(2),
      state: z.string().min(2).max(2),
      birthDate: z.string(),
      phone1: z.string().regex(brPhoneRegex),
      phone2: z.string().regex(brPhoneRegex).optional().or(z.literal('')).nullable(),
      monthlyIncome: z.coerce.number().min(0),
      residenceMonths: z.coerce.number().int().min(0),
      status: z.enum(['ATIVO', 'BLOQUEADO', 'INADIMPLENTE']).optional().default('ATIVO'),
      notes: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const customer = await prisma.customer.create({
      data: {
        cpf: data.cpf,
        name: data.name,
        zipCode: data.zipCode || null,
        street: data.street,
        number: data.number,
        complement: data.complement || null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        birthDate: parseDate(data.birthDate),
        phone1: data.phone1,
        phone2: data.phone2 || null,
        monthlyIncome: data.monthlyIncome,
        residenceMonths: data.residenceMonths,
        status: data.status,
        notes: data.notes || null,
        createdById: req.user.sub
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'CREATE',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      description: `Cliente ${customer.name} criado.`
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao criar cliente.' });
  }
});

app.put('/customers/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Cliente não encontrado.' });


    const schema = z.object({
      cpf: z.string().regex(cpfRegex),
      name: z.string().min(3),
      zipCode: z.string().optional().nullable(),
      street: z.string().min(3),
      number: z.string().min(1),
      complement: z.string().optional().nullable(),
      neighborhood: z.string().min(2),
      city: z.string().min(2),
      state: z.string().min(2).max(2),
      birthDate: z.string(),
      phone1: z.string().regex(brPhoneRegex),
      phone2: z.string().regex(brPhoneRegex).optional().or(z.literal('')).nullable(),
      monthlyIncome: z.coerce.number().min(0),
      residenceMonths: z.coerce.number().int().min(0),
      status: z.enum(['ATIVO', 'BLOQUEADO', 'INADIMPLENTE']),
      notes: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        cpf: data.cpf,
        name: data.name,
        zipCode: data.zipCode || null,
        street: data.street,
        number: data.number,
        complement: data.complement || null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        birthDate: parseDate(data.birthDate),
        phone1: data.phone1,
        phone2: data.phone2 || null,
        monthlyIncome: data.monthlyIncome,
        residenceMonths: data.residenceMonths,
        status: data.status,
        notes: data.notes || null,
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'UPDATE',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      description: `Cliente ${customer.name} atualizado.`
    });

    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao atualizar cliente.' });
  }
});

app.delete('/customers/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'DELETE',
      entityType: 'CUSTOMER',
      entityId: req.params.id,
      description: 'Cliente excluído.'
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao excluir cliente.' });
  }
});


// Endpoint otimizado para o cobrador — retorna só o necessário para cobrança
app.get('/collector/dashboard', auth(['COLLECTOR']), async (req, res) => {
  try {
    // Buscar contratos atribuídos ao cobrador com parcelas pendentes
    const contracts = await prisma.contract.findMany({
      where: {
        status: { not: 'QUITADO' },
        assignments: { some: { collectorId: req.user.sub } }
      },
      select: {
        id: true,
        product: true,
        financedAmount: true,
        installmentCount: true,
        interestRate: true,
        status: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
            cpf: true,
            phone1: true,
            phone2: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true
          }
        },
        installments: {
          where: { status: { not: 'PAGA' } },
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            dueDate: true,
            amount: true,
            paidAmount: true,
            status: true
          }
        },
        payments: {
          select: { amount: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calcular dados derivados de forma simples
    const result = contracts.map(contract => {
      const totalWithInterest = Number(
        (Number(contract.financedAmount) * (1 + Number(contract.interestRate) / 100)).toFixed(2)
      );
      const paidAmount = Number(
        contract.payments.reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)
      );
      const pendingAmount = Math.max(totalWithInterest - paidAmount, 0);
      const overdueInstallments = contract.installments.filter(i => i.status === 'ATRASADA').length;
      const paidInstallments = contract.installmentCount - contract.installments.length;

      return {
        id: contract.id,
        product: contract.product,
        financedAmount: contract.financedAmount,
        installmentCount: contract.installmentCount,
        status: contract.status,
        customerId: contract.customerId,
        customer: contract.customer,
        installments: contract.installments,
        pendingAmount: Number(pendingAmount.toFixed(2)),
        paidAmount,
        overdueInstallments,
        paidInstallments,
        remainingInstallments: contract.installments.length
      };
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao carregar dados do cobrador.' });
  }
});

app.get('/contracts', auth(), async (req, res) => {
  const q = req.query.q?.toString() || '';
  const status = req.query.status?.toString() || '';
  const overdueOnly = req.query.overdue === 'true';

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { product: { contains: q } },
            { customer: { name: { contains: q } } },
            { customer: { cpf: { contains: q } } }
          ]
        }
      : {}),
    ...(req.user.role === 'COLLECTOR'
      ? {
          assignments: {
            some: {
              collectorId: req.user.sub
            }
          }
        }
      : {}),
    
  };

  const rawContracts = await prisma.contract.findMany({
    where,
    include: {
      customer: true,
      installments: { orderBy: { number: 'asc' } },
      payments: {
        include: {
          installment: true,
          collector: { select: { id: true, name: true, email: true } }
        }
      },
      assignments: {
        include: {
          collector: { select: { id: true, name: true, email: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const contracts = await Promise.all(rawContracts.map(enrichContract));
  const filtered = overdueOnly ? contracts.filter((c) => c.overdueInstallments > 0) : contracts;

  res.json(filtered);
});

app.post('/contracts', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      customerId: z.string().min(1),
      product: z.string().min(2),
      quantity: z.coerce.number().int().min(1).default(1),
      financedAmount: z.coerce.number().positive(),
      installmentCount: z.coerce.number().int().positive(),
      contractStartDate: z.string(),
      interestRate: z.coerce.number().min(0),
      notes: z.string().optional().nullable(),
      status: z.enum(['ATIVO', 'QUITADO', 'ATRASADO', 'RENEGOCIADO']).optional().default('ATIVO'),
      promisedPaymentDate: z.string().optional().nullable(),
      promisedPaymentValue: z.coerce.number().optional().nullable(),
      collectionNote: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const totalWithInterest = calcContractTotal(data);
    const installments = buildInstallments(
      parseDate(data.contractStartDate),
      data.installmentCount,
      totalWithInterest
    );

    const contract = await prisma.contract.create({
      data: {
        customerId: data.customerId,
        product: data.product,
        financedAmount: data.financedAmount,
        installmentCount: data.installmentCount,
        contractStartDate: parseDate(data.contractStartDate),
        interestRate: data.interestRate,
        notes: data.notes || null,
        status: data.status,
        promisedPaymentDate: data.promisedPaymentDate ? parseDate(data.promisedPaymentDate) : null,
        promisedPaymentValue: data.promisedPaymentValue ?? null,
        collectionNote: data.collectionNote || null,
        installments: {
          create: installments
        }
      },
      include: {
        customer: true,
          installments: true,
        payments: true,
        assignments: true
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'CREATE',
      entityType: 'CONTRACT',
      entityId: contract.id,
      description: `Contrato criado para ${contract.product}.`
    });

    // ── Baixa automática no estoque ao criar contrato ─────────
    try {
      const customer = contract.customer;
      const destination = `Venda para ${customer.name} CPF ${customer.cpf}`;

      // Verificar se é uma cesta
      const basket = await prisma.basket.findFirst({
        where: { name: data.product, isActive: true },
        include: { items: { include: { product: true } } }
      });

      if (basket) {
        // Baixa no estoque de cestas
        if (basket.currentStock >= data.quantity) {
          const basketSalePricePerUnit = data.quantity > 0
            ? Number((data.financedAmount / data.quantity).toFixed(2))
            : data.financedAmount;
          const basketMargin = basket.costPrice > 0 && basketSalePricePerUnit > 0
            ? Number((((basketSalePricePerUnit - basket.costPrice) / basketSalePricePerUnit) * 100).toFixed(2))
            : null;

          await prisma.basketMovement.create({
            data: {
              basketId: basket.id,
              type: 'VENDA',
              quantity: data.quantity,
              unitCost: basket.costPrice,
              salePrice: basketSalePricePerUnit,
              margin: basketMargin,
              destination,
              contractId: contract.id,
              customerId: data.customerId,
              notes: `Contrato ID ${contract.id} · Total: R$ ${data.financedAmount.toFixed(2)} · ${data.quantity} un`,
              userId: req.user.sub
            }
          });
          await prisma.basket.update({
            where: { id: basket.id },
            data: { currentStock: { increment: -data.quantity } }
          });
        }
      } else {
        // Verificar se é um produto do estoque
        const product = await prisma.product.findFirst({
          where: { name: data.product, isActive: true }
        });

        if (product && product.currentStock >= data.quantity) {
          // Preço de venda por unidade = valor total / quantidade de unidades
          const salePricePerUnit = data.quantity > 0
            ? Number((data.financedAmount / data.quantity).toFixed(2))
            : data.financedAmount;

          // Margem calculada por unidade: (venda/un - custo/un) / venda/un
          const margin = product.costPrice > 0 && salePricePerUnit > 0
            ? Number((((salePricePerUnit - product.costPrice) / salePricePerUnit) * 100).toFixed(2))
            : null;

          await prisma.stockMovement.create({
            data: {
              productId: product.id,
              type: 'SAIDA',
              quantity: data.quantity,
              unitCost: product.costPrice,       // custo por unidade
              salePrice: salePricePerUnit,        // venda por unidade
              margin,
              destination,
              contractId: contract.id,
              customerId: data.customerId,
              notes: `Contrato ID ${contract.id} · Total: R$ ${data.financedAmount.toFixed(2)} · ${data.quantity} ${product.unit}`,
              userId: req.user.sub
            }
          });
          await prisma.product.update({
            where: { id: product.id },
            data: { currentStock: { increment: -data.quantity }, updatedAt: new Date() }
          });
        }
      }
    } catch (stockError) {
      // Não falha o contrato se o estoque não puder ser baixado
      console.error('Erro ao baixar estoque:', stockError.message);
    }

    res.status(201).json(await enrichContract(contract));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao criar contrato.' });
  }
});

app.put('/contracts/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { payments: true }
    });

    if (!existing) return res.status(404).json({ message: 'Contrato não encontrado.' });


    const schema = z.object({
      customerId: z.string().min(1),
      product: z.string().min(2),
      financedAmount: z.coerce.number().positive(),
      installmentCount: z.coerce.number().int().positive(),
      contractStartDate: z.string(),
      interestRate: z.coerce.number().min(0),
      notes: z.string().optional().nullable(),
      status: z.enum(['ATIVO', 'QUITADO', 'ATRASADO', 'RENEGOCIADO']).optional().default('ATIVO'),
      promisedPaymentDate: z.string().optional().nullable(),
      promisedPaymentValue: z.coerce.number().optional().nullable(),
      collectionNote: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);


    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        customerId: data.customerId,
        product: data.product,
        financedAmount: data.financedAmount,
        installmentCount: data.installmentCount,
        contractStartDate: parseDate(data.contractStartDate),
        interestRate: data.interestRate,
        notes: data.notes || null,
        status: data.status,
        promisedPaymentDate: data.promisedPaymentDate ? parseDate(data.promisedPaymentDate) : null,
        promisedPaymentValue: data.promisedPaymentValue ?? null,
        collectionNote: data.collectionNote || null,
        updatedAt: new Date()
      },
      include: {
        customer: true,
          installments: true,
        payments: true,
        assignments: true
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'UPDATE',
      entityType: 'CONTRACT',
      entityId: contract.id,
      description: 'Contrato atualizado.'
    });

    res.json(await enrichContract(contract));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao atualizar contrato.' });
  }
});

app.post('/contracts/:id/renegotiate', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      installmentCount: z.coerce.number().int().positive(),
      contractStartDate: z.string(),
      interestRate: z.coerce.number().min(0),
      notes: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const oldContract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        installments: true,
        payments: true,
      }
    });

    if (!oldContract) return res.status(404).json({ message: 'Contrato não encontrado.' });

    const enrichedOld = await enrichContract(oldContract);
    if (Number(enrichedOld.pendingAmount || 0) <= 0) {
      return res.status(400).json({ message: 'Este contrato não possui saldo para renegociação.' });
    }

    const newContractDraft = {
      financedAmount: enrichedOld.pendingAmount,
      interestRate: data.interestRate
    };
    const totalWithInterest = calcContractTotal(newContractDraft);

    const installments = buildInstallments(
      parseDate(data.contractStartDate),
      data.installmentCount,
      totalWithInterest
    );

    const newContract = await prisma.contract.create({
      data: {
        customerId: oldContract.customerId,
        product: `${oldContract.product} (Renegociação)`,
        financedAmount: enrichedOld.pendingAmount,
        installmentCount: data.installmentCount,
        contractStartDate: parseDate(data.contractStartDate),
        interestRate: data.interestRate,
        notes: data.notes || null,
        status: 'ATIVO',
        renegotiatedFromId: oldContract.id,
        installments: {
          create: installments
        }
      },
      include: {
        customer: true,
          installments: true,
        payments: true,
        assignments: true
      }
    });

    await prisma.contract.update({
      where: { id: oldContract.id },
      data: {
        status: 'RENEGOCIADO',
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'RENEGOTIATE',
      entityType: 'CONTRACT',
      entityId: newContract.id,
      description: `Contrato renegociado a partir do contrato ${oldContract.id}.`
    });

    res.status(201).json(await enrichContract(newContract));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao renegociar contrato.' });
  }
});

app.delete('/contracts/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.contract.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'DELETE',
      entityType: 'CONTRACT',
      entityId: req.params.id,
      description: 'Contrato excluído.'
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao excluir contrato.' });
  }
});

app.get('/assignments', auth(), async (req, res) => {
  const where = req.user.role === 'COLLECTOR' ? { collectorId: req.user.sub } : undefined;

  const assignments = await prisma.assignment.findMany({
    where,
    include: {
      collector: { select: { id: true, name: true, email: true } },
      contract: {
        include: {
          customer: true,
              installments: { orderBy: { number: 'asc' } },
          payments: true
        }
      }
    },
    orderBy: { assignedAt: 'desc' }
  });

  const enriched = await Promise.all(
    assignments.map(async (assignment) => {
      const contract = await enrichContract(assignment.contract);
      return { ...assignment, contract };
    })
  );

  res.json(enriched);
});

app.post('/assignments', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      contractId: z.string().min(1),
      collectorId: z.string().min(1),
      targetAmount: z.coerce.number().min(0).optional().nullable(),
      notes: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const assignment = await prisma.assignment.create({
      data: {
        contractId: data.contractId,
        collectorId: data.collectorId,
        targetAmount: data.targetAmount ?? null,
        notes: data.notes || null
      },
      include: {
        collector: { select: { id: true, name: true, email: true } },
        contract: {
          include: { customer: true, installments: true, payments: true }
        }
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'CREATE',
      entityType: 'ASSIGNMENT',
      entityId: assignment.id,
      description: 'Distribuição criada.'
    });

    res.status(201).json({
      ...assignment,
      contract: await enrichContract(assignment.contract)
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao distribuir contrato.' });
  }
});

app.post('/distribution/bulk', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      collectorId: z.string().min(1),
      contractIds: z.array(z.string().min(1)).min(1)
    });

    const data = schema.parse(req.body);

    for (const contractId of data.contractIds) {
      const exists = await prisma.assignment.findFirst({
        where: { contractId, collectorId: data.collectorId }
      });

      if (!exists) {
        const assignment = await prisma.assignment.create({
          data: { contractId, collectorId: data.collectorId }
        });

        await writeAuditLog({
          userId: req.user.sub,
          action: 'CREATE',
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
          description: 'Distribuição em lote criada.',
          metadata: { contractId, collectorId: data.collectorId }
        });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro na distribuição em lote.' });
  }
});

app.get('/distribution/collectors', auth(['ADMIN']), async (_req, res) => {
  const collectors = await prisma.user.findMany({
    where: { role: 'COLLECTOR', isActive: true },
    include: {
      assignments: {
        include: {
          contract: { include: { customer: true } }
        }
      }
    }
  });

  res.json(
    collectors.map((collector) => ({
      id: collector.id,
      name: collector.name,
      email: collector.email,
      assignedCount: collector.assignments.length,
      assignedCustomers: collector.assignments.map((a) => ({
        assignmentId: a.id,
        customerName: a.contract.customer.name,
        product: a.contract.product
      }))
    }))
  );
});

app.get('/distribution/available-contracts', auth(['ADMIN']), async (_req, res) => {
  const contracts = await prisma.contract.findMany({
    include: {
      customer: true,
      assignments: true,
      installments: true,
      payments: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const enrichedContracts = await Promise.all(contracts.map(enrichContract));

  res.json(
    enrichedContracts
      .filter((c) =>
        c.status !== 'QUITADO' &&
        Number(c.pendingAmount || 0) > 0 &&
        (!c.assignments || c.assignments.length === 0)
      )
      .map((c) => ({
        id: c.id,
        product: c.product,
        financedAmount: c.financedAmount,
        installmentCount: c.installmentCount,
        paidInstallments: c.paidInstallments,
        remainingInstallments: c.remainingInstallments,
        overdueInstallments: c.overdueInstallments,
        pendingAmount: c.pendingAmount,
        status: c.status,
        customer: c.customer,
      }))
  );
});

app.put('/assignments/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      collectorId: z.string().min(1),
      targetAmount: z.coerce.number().min(0).optional().nullable(),
      notes: z.string().optional().nullable()
    });

    const data = schema.parse(req.body);

    const assignment = await prisma.assignment.update({
      where: { id: req.params.id },
      data: {
        collectorId: data.collectorId,
        targetAmount: data.targetAmount ?? null,
        notes: data.notes || null,
        updatedAt: new Date()
      },
      include: {
        collector: { select: { id: true, name: true, email: true } },
        contract: { include: { customer: true, installments: true, payments: true } }
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'UPDATE',
      entityType: 'ASSIGNMENT',
      entityId: assignment.id,
      description: 'Distribuição atualizada.'
    });

    res.json({
      ...assignment,
      contract: await enrichContract(assignment.contract)
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao atualizar distribuição.' });
  }
});

app.delete('/assignments/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.assignment.delete({ where: { id: req.params.id } });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'DELETE',
      entityType: 'ASSIGNMENT',
      entityId: req.params.id,
      description: 'Distribuição removida.'
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao remover distribuição.' });
  }
});

app.get('/payments', auth(), async (req, res) => {
  const q = req.query.q?.toString() || '';
  const where = {
    ...(req.user.role === 'COLLECTOR' ? { collectorId: req.user.sub } : {}),
    ...(q
      ? {
          OR: [
            { contract: { customer: { name: { contains: q } } } },
            { contract: { customer: { cpf: { contains: q } } } },
            { contract: { product: { contains: q } } }
          ]
        }
      : {})
  };

  const payments = await prisma.payment.findMany({
    where,
    include: {
      collector: { select: { id: true, name: true, email: true } },
      contract: {
        include: {
          customer: true,
              installments: true,
          payments: true
        }
      },
      installment: true
    },
    orderBy: { paymentDate: 'desc' }
  });

  const enrichedPayments = await Promise.all(
    payments.map(async (payment) => ({
      ...payment,
      contract: await enrichContract(payment.contract)
    }))
  );

  res.json(enrichedPayments);
});

app.get('/payments/:id/receipt', auth(), async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        collector: true,
        contract: { include: { customer: true } },
        installment: true
      }
    });
    if (!payment) return res.status(404).json({ message: 'Pagamento não encontrado.' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const fileName = `comprovante-${payment.receiptCode || payment.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 70).fill('#1877f2');
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff')
      .text('MiPixi', 50, 18, { align: 'left' });
    doc.fontSize(11).font('Helvetica').fillColor('#dbeafe')
      .text('Comprovante de Pagamento', 50, 44, { align: 'left' });
    doc.fillColor('#000000');

    doc.y = 90;

    // Número do recibo em destaque
    doc.roundedRect(50, doc.y, doc.page.width - 100, 36, 6).fill('#f0f7ff');
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text('Número do Recibo', 62, doc.y - 28);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1877f2').text(payment.receiptCode || '-', 62, doc.y - 14);
    doc.y += 14;

    doc.moveDown(0.8);

    // Separador
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(0.6);

    // Campos
    const field = (label, value) => {
      const y = doc.y;
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(label.toUpperCase(), 50, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(String(value || '-'), 50, y + 13);
      doc.y += 38;
    };
    const fieldPair = (l1, v1, l2, v2) => {
      const y = doc.y;
      const half = (doc.page.width - 100) / 2;
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(l1.toUpperCase(), 50, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(String(v1 || '-'), 50, y + 13);
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(l2.toUpperCase(), 50 + half + 10, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(String(v2 || '-'), 50 + half + 10, y + 13);
      doc.y += 38;
    };

    field('Cliente', payment.contract.customer.name);
    fieldPair('CPF', payment.contract.customer.cpf, 'Telefone', payment.contract.customer.phone1 || '-');
    field('Produto / Contrato', payment.contract.product);
    fieldPair('Parcela nº', payment.installment ? payment.installment.number : '-', 'Forma de Pagamento', payment.paymentMethod);
    fieldPair('Data do Pagamento', new Date(payment.paymentDate).toLocaleDateString('pt-BR'), 'Cobrador', payment.collector.name);

    if (payment.notes) field('Observacoes', payment.notes);

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(0.6);

    // Valor em destaque
    doc.roundedRect(50, doc.y, doc.page.width - 100, 50, 8).fill('#1877f2');
    doc.fontSize(11).font('Helvetica').fillColor('#dbeafe').text('VALOR PAGO', 62, doc.y - 42);
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff')
      .text(`R$ ${Number(payment.amount).toFixed(2).replace('.', ',')}`, 62, doc.y - 26);
    doc.y += 12;

    // Rodapé
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text(`Emitido em ${new Date().toLocaleString('pt-BR')} • MiPixi`, 50, doc.y, { align: 'center' });

    doc.end();
  } catch (error) {
    if (!res.headersSent) res.status(400).json({ message: error.message || 'Erro ao gerar comprovante.' });
  }
});

app.post('/payments', auth(['ADMIN', 'COLLECTOR']), async (req, res) => {
  try {
    const schema = z.object({
      contractId: z.string().min(1),
      installmentId: z.string().optional().nullable(),
      amount: z.coerce.number().positive(),
      paymentDate: z.string(),
      paymentMethod: z.enum(['PIX', 'DINHEIRO']),
      notes: z.string().optional().nullable(),
      collectorId: z.string().min(1)
    });

    const data = schema.parse(req.body);
    const collectorId = req.user.role === 'COLLECTOR' ? req.user.sub : data.collectorId;

    const assignment = await prisma.assignment.findFirst({
      where: { contractId: data.contractId, collectorId }
    });

    if (!assignment && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Este contrato não está atribuído ao cobrador informado.' });
    }

    let installment = null;
    if (data.installmentId) {
      installment = await prisma.installment.findUnique({
        where: { id: data.installmentId }
      });
    } else {
      installment = await prisma.installment.findFirst({
        where: {
          contractId: data.contractId,
          OR: [{ status: 'PENDENTE' }, { status: 'ATRASADA' }, { status: 'PARCIAL' }]
        },
        orderBy: { number: 'asc' }
      });
    }

    if (!installment) {
      return res.status(400).json({ message: 'Nenhuma parcela disponível para pagamento.' });
    }

    const nextPaidAmount = Number(
      (Number(installment.paidAmount || 0) + Number(data.amount)).toFixed(2)
    );

    if (nextPaidAmount > Number(installment.amount) + 0.01) {
      return res.status(400).json({ message: 'O valor informado excede o saldo da parcela.' });
    }

    const updatedInstallment = await prisma.installment.update({
      where: { id: installment.id },
      data: {
        paidAmount: nextPaidAmount,
        paidAt: nextPaidAmount >= Number(installment.amount) ? parseDate(data.paymentDate) : null,
        status: normalizeInstallmentStatus({
          ...installment,
          paidAmount: nextPaidAmount
        }),
        updatedAt: new Date()
      }
    });

    const payment = await prisma.payment.create({
      data: {
        contractId: data.contractId,
        installmentId: updatedInstallment.id,
        collectorId,
        amount: data.amount,
        paymentDate: parseDate(data.paymentDate),
        paymentMethod: data.paymentMethod,
        notes: data.notes || null,
        receiptCode: `REC-${Date.now()}`
      },
      include: {
        collector: { select: { id: true, name: true, email: true } },
        contract: { include: { customer: true } },
        installment: true
      }
    });

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      include: { installments: true }
    });

    await prisma.contract.update({
      where: { id: data.contractId },
      data: {
        status: normalizeContractStatus(contract),
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'CREATE',
      entityType: 'PAYMENT',
      entityId: payment.id,
      description: 'Pagamento registrado.',
      metadata: {
        contractId: payment.contractId,
        installmentId: payment.installmentId,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        collectorId: payment.collectorId,
        receiptCode: payment.receiptCode
      }
    });

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao registrar pagamento.' });
  }
});

app.put('/payments/:id', auth(['ADMIN', 'COLLECTOR']), async (req, res) => {
  try {
    const existing = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { installment: true }
    });

    if (!existing) return res.status(404).json({ message: 'Pagamento não encontrado.' });
    if (req.user.role === 'COLLECTOR' && existing.collectorId !== req.user.sub) {
      return res.status(403).json({ message: 'Sem permissão para editar este pagamento.' });
    }

    const schema = z.object({
      amount: z.coerce.number().positive(),
      paymentDate: z.string(),
      paymentMethod: z.enum(['PIX', 'DINHEIRO']),
      notes: z.string().optional().nullable(),
      collectorId: z.string().min(1)
    });

    const data = schema.parse(req.body);
    const collectorId = req.user.role === 'COLLECTOR' ? req.user.sub : data.collectorId;

    if (existing.installmentId) {
      const installment = await prisma.installment.findUnique({
        where: { id: existing.installmentId }
      });

      const recalculatedPaidAmount = Number(
        (
          Number(installment.paidAmount || 0) -
          Number(existing.amount || 0) +
          Number(data.amount || 0)
        ).toFixed(2)
      );

      if (recalculatedPaidAmount > Number(installment.amount) + 0.01) {
        return res.status(400).json({ message: 'O valor informado excede o saldo da parcela.' });
      }

      await prisma.installment.update({
        where: { id: installment.id },
        data: {
          paidAmount: recalculatedPaidAmount,
          paidAt: recalculatedPaidAmount >= Number(installment.amount) ? parseDate(data.paymentDate) : null,
          status: normalizeInstallmentStatus({
            ...installment,
            paidAmount: recalculatedPaidAmount
          }),
          updatedAt: new Date()
        }
      });
    }

    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        collectorId,
        amount: data.amount,
        paymentDate: parseDate(data.paymentDate),
        paymentMethod: data.paymentMethod,
        notes: data.notes || null,
        updatedAt: new Date()
      },
      include: {
        collector: { select: { id: true, name: true, email: true } },
        contract: { include: { customer: true } },
        installment: true
      }
    });

    const contractToUpdate = await prisma.contract.findUnique({
      where: { id: existing.contractId },
      include: { installments: true }
    });

    await prisma.contract.update({
      where: { id: existing.contractId },
      data: {
        status: normalizeContractStatus(contractToUpdate),
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'UPDATE',
      entityType: 'PAYMENT',
      entityId: payment.id,
      description: 'Pagamento atualizado.'
    });

    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao atualizar pagamento.' });
  }
});

app.delete('/payments/:id', auth(['ADMIN', 'COLLECTOR']), async (req, res) => {
  try {
    const existing = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { installment: true }
    });

    if (!existing) return res.status(404).json({ message: 'Pagamento não encontrado.' });
    if (req.user.role === 'COLLECTOR' && existing.collectorId !== req.user.sub) {
      return res.status(403).json({ message: 'Sem permissão para excluir este pagamento.' });
    }

    if (existing.installmentId) {
      const installment = await prisma.installment.findUnique({
        where: { id: existing.installmentId }
      });

      const newPaidAmount = Number(
        Math.max(Number(installment.paidAmount || 0) - Number(existing.amount || 0), 0).toFixed(2)
      );

      await prisma.installment.update({
        where: { id: installment.id },
        data: {
          paidAmount: newPaidAmount,
          paidAt: newPaidAmount >= Number(installment.amount) ? installment.paidAt : null,
          status: normalizeInstallmentStatus({
            ...installment,
            paidAmount: newPaidAmount
          }),
          updatedAt: new Date()
        }
      });
    }

    await prisma.payment.delete({ where: { id: req.params.id } });

    const contractToUpdate = await prisma.contract.findUnique({
      where: { id: existing.contractId },
      include: { installments: true }
    });

    await prisma.contract.update({
      where: { id: existing.contractId },
      data: {
        status: normalizeContractStatus(contractToUpdate),
        updatedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: 'DELETE',
      entityType: 'PAYMENT',
      entityId: req.params.id,
      description: 'Pagamento excluído.'
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao excluir pagamento.' });
  }
});

app.get('/cash-accounts/monthly', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const collectorId = req.query.collectorId?.toString() || '';

    if (!month || !year) {
      return res.status(400).json({ message: 'Informe mês e ano.' });
    }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const where = {
      paymentDate: {
        gte: startDate,
        lte: endDate
      },
      ...(collectorId ? { collectorId } : {})
    };

    const payments = await prisma.payment.findMany({
      where,
      include: {
        collector: { select: { id: true, name: true, email: true } },
        contract: {
          include: {
            customer: true
          }
        },
        installment: true
      },
      orderBy: [{ collectorId: 'asc' }, { paymentDate: 'asc' }]
    });

    const grouped = new Map();

    for (const payment of payments) {
      const key = payment.collectorId;
      const current = grouped.get(key) || {
        collectorId: payment.collector.id,
        collectorName: payment.collector.name,
        collectorEmail: payment.collector.email,
        month,
        year,
        totalReceived: 0,
        totalPix: 0,
        totalCash: 0,
        receiptsCount: 0,
        items: []
      };

      current.totalReceived += Number(payment.amount || 0);
      current.receiptsCount += 1;

      if (payment.paymentMethod === 'PIX') {
        current.totalPix += Number(payment.amount || 0);
      }

      if (payment.paymentMethod === 'DINHEIRO') {
        current.totalCash += Number(payment.amount || 0);
      }

      current.items.push({
        id: payment.id,
        date: payment.paymentDate,
        client: payment.contract.customer.name,
        cpf: payment.contract.customer.cpf,
        contract: payment.contract.product,
        installmentNumber: payment.installment?.number || null,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        collector: payment.collector.name,
        receiptCode: payment.receiptCode || ''
      });

      grouped.set(key, current);
    }

    const result = Array.from(grouped.values()).map((item) => ({
      ...item,
      totalReceived: Number(item.totalReceived.toFixed(2)),
      totalPix: Number(item.totalPix.toFixed(2)),
      totalCash: Number(item.totalCash.toFixed(2))
    }));

    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao gerar prestação de contas mensal.' });
  }
});

app.get('/cash-accounts/monthly/receipt', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const collectorId = req.query.collectorId?.toString() || '';

    if (!month || !year || !collectorId) {
      return res.status(400).json({ message: 'Informe mês, ano e cobrador.' });
    }

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        collectorId,
        paymentDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        collector: true,
        contract: {
          include: {
            customer: true
          }
        },
        installment: true
      },
      orderBy: { paymentDate: 'asc' }
    });

    if (!payments.length) {
      return res.status(404).json({ message: 'Nenhum recebimento encontrado para este período.' });
    }

    const collector = payments[0].collector;
    const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalPix = payments
      .filter((p) => p.paymentMethod === 'PIX')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalCash = payments
      .filter((p) => p.paymentMethod === 'DINHEIRO')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const rowsHtml = payments
      .map(
        (p) => `
          <tr>
            <td>${new Date(p.paymentDate).toLocaleDateString('pt-BR')}</td>
            <td>${p.contract.customer.name}</td>
            <td>${p.contract.product}</td>
            <td>${p.installment?.number || '-'}</td>
            <td>${p.paymentMethod}</td>
            <td>R$ ${Number(p.amount).toFixed(2)}</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Prestação de Contas Mensal</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          .box { max-width: 1100px; margin: 0 auto; }
          h1 { margin-bottom: 8px; color: #1877f2; }
          .meta { margin-bottom: 18px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
          .card { border: 1px solid #dbe2ea; border-radius: 12px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #dbe2ea; padding: 10px; font-size: 14px; text-align: left; }
          th { background: #f5f9ff; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Prestação de Contas Mensal</h1>
          <div class="meta">
            <div><strong>Cobrador:</strong> ${collector.name}</div>
            <div><strong>Mês de referência:</strong> ${String(month).padStart(2, '0')}/${year}</div>
            <div><strong>Quantidade de recebimentos:</strong> ${payments.length}</div>
          </div>
          <div class="summary">
            <div class="card"><strong>Total em PIX</strong><br />R$ ${totalPix.toFixed(2)}</div>
            <div class="card"><strong>Total em Dinheiro</strong><br />R$ ${totalCash.toFixed(2)}</div>
            <div class="card"><strong>Total Geral</strong><br />R$ ${totalReceived.toFixed(2)}</div>
            <div class="card"><strong>Recebimentos</strong><br />${payments.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Contrato</th>
                <th>Parcela</th>
                <th>Forma</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erro ao gerar comprovante mensal.' });
  }
});

// ── Prestação de contas: PDF ─────────────────────────────────────
app.get('/cash-accounts/monthly/receipt/pdf', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year  = Number(req.query.year);
    const collectorId = req.query.collectorId?.toString() || '';
    if (!month || !year || !collectorId) return res.status(400).json({ message: 'Informe mes, ano e cobrador.' });

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate   = new Date(year, month, 0, 23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: { collectorId, paymentDate: { gte: startDate, lte: endDate } },
      include: { collector: true, contract: { include: { customer: true } }, installment: true },
      orderBy: { paymentDate: 'asc' }
    });
    if (!payments.length) return res.status(404).json({ message: 'Nenhum recebimento encontrado para este periodo.' });

    const collector     = payments[0].collector;
    const totalReceived = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalPix      = payments.filter(p => p.paymentMethod === 'PIX').reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalCash     = payments.filter(p => p.paymentMethod === 'DINHEIRO').reduce((s, p) => s + Number(p.amount || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const mesRef = `${String(month).padStart(2, '0')}/${year}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prestacao-${collector.name.replace(/\s+/g, '-')}-${mesRef.replace('/', '-')}.pdf"`);
    doc.pipe(res);

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 65).fill('#1877f2');
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff').text('MiPixi', 40, 14);
    doc.fontSize(11).font('Helvetica').fillColor('#dbeafe').text('Prestacao de Contas Mensal', 40, 38);
    doc.fillColor('#000000');
    doc.y = 80;

    // Infos do cobrador
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(`Cobrador: ${collector.name}`, 40, doc.y);
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(`Mes de referencia: ${mesRef}   |   Recebimentos: ${payments.length}`, 40, doc.y + 14);
    doc.y += 32;

    // Cards de resumo
    const cardW = (doc.page.width - 80 - 30) / 4;
    const cardH = 44;
    const cardY = doc.y;
    const cards = [
      { label: 'Total PIX', value: `R$ ${totalPix.toFixed(2).replace('.', ',')}` },
      { label: 'Total Dinheiro', value: `R$ ${totalCash.toFixed(2).replace('.', ',')}` },
      { label: 'Total Geral', value: `R$ ${totalReceived.toFixed(2).replace('.', ',')}` },
      { label: 'Qtd Recebimentos', value: String(payments.length) },
    ];
    cards.forEach((c, i) => {
      const cx = 40 + i * (cardW + 10);
      doc.roundedRect(cx, cardY, cardW, cardH, 4).fill(i === 2 ? '#1877f2' : '#f0f7ff');
      doc.fontSize(8).font('Helvetica').fillColor(i === 2 ? '#dbeafe' : '#6b7280').text(c.label, cx + 10, cardY + 8);
      doc.fontSize(13).font('Helvetica-Bold').fillColor(i === 2 ? '#ffffff' : '#111827').text(c.value, cx + 10, cardY + 20);
    });
    doc.y = cardY + cardH + 14;

    // Tabela
    const cols = [70, 120, 130, 55, 65, 120, 80];
    const headers = ['Data', 'Cliente', 'Contrato', 'Parcela', 'Forma', 'Cobrador', 'Valor (R$)'];
    const rows = payments.map(p => [
      new Date(p.paymentDate).toLocaleDateString('pt-BR'),
      p.contract.customer.name,
      p.contract.product,
      p.installment?.number ?? '-',
      p.paymentMethod,
      p.collector.name,
      `R$ ${Number(p.amount).toFixed(2).replace('.', ',')}`
    ]);
    pdfDrawTable(doc, headers, rows, cols, { x: 40 });

    // Rodapé
    doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
      .text(`Emitido em ${new Date().toLocaleString('pt-BR')} • MiPixi`, 40, doc.y, { align: 'center' });

    doc.end();
  } catch (error) {
    if (!res.headersSent) res.status(400).json({ message: error.message || 'Erro ao gerar PDF.' });
  }
});

// ── Prestação de contas: Excel ────────────────────────────────────
app.get('/cash-accounts/monthly/receipt/excel', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year  = Number(req.query.year);
    const collectorId = req.query.collectorId?.toString() || '';
    if (!month || !year || !collectorId) return res.status(400).json({ message: 'Informe mes, ano e cobrador.' });

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate   = new Date(year, month, 0, 23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: { collectorId, paymentDate: { gte: startDate, lte: endDate } },
      include: { collector: true, contract: { include: { customer: true } }, installment: true },
      orderBy: { paymentDate: 'asc' }
    });
    if (!payments.length) return res.status(404).json({ message: 'Nenhum recebimento encontrado para este periodo.' });

    const collector     = payments[0].collector;
    const mesRef        = `${String(month).padStart(2, '0')}/${year}`;
    const totalReceived = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MiPixi';
    const sheet = workbook.addWorksheet('Prestacao de Contas');

    // Linha de titulo
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `Prestacao de Contas Mensal - ${collector.name} - ${mesRef}`;
    sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1877F2' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getRow(1).height = 28;

    // Linha de resumo
    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = `Recebimentos: ${payments.length} | Total: R$ ${totalReceived.toFixed(2)}`;
    sheet.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF374151' } };
    sheet.getRow(2).height = 18;

    sheet.addRow([]); // linha vazia

    // Cabecalho da tabela
    sheet.columns = [
      { key: 'data',       width: 14 },
      { key: 'cliente',    width: 28 },
      { key: 'contrato',   width: 26 },
      { key: 'parcela',    width: 10 },
      { key: 'forma',      width: 13 },
      { key: 'cobrador',   width: 22 },
      { key: 'valor',      width: 14 },
    ];
    const headerRow = sheet.addRow(['Data', 'Cliente', 'Contrato', 'Parcela', 'Forma', 'Cobrador', 'Valor (R$)']);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1877F2' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } } };
    });
    headerRow.height = 22;

    // Dados
    payments.forEach((p, idx) => {
      const row = sheet.addRow([
        new Date(p.paymentDate).toLocaleDateString('pt-BR'),
        p.contract.customer.name,
        p.contract.product,
        p.installment?.number ?? '-',
        p.paymentMethod,
        p.collector.name,
        Number(p.amount)
      ]);
      const bg = idx % 2 === 0 ? 'FFF0F7FF' : 'FFFFFFFF';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle' };
        cell.font = { size: 10 };
      });
      // Formatar coluna de valor como moeda
      row.getCell(7).numFmt = '"R$ "#,##0.00';
      row.getCell(7).alignment = { horizontal: 'right' };
      row.height = 18;
    });

    // Linha de total
    const totalRow = sheet.addRow(['', '', '', '', '', 'TOTAL', totalReceived]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1877F2' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    totalRow.getCell(7).numFmt = '"R$ "#,##0.00';
    totalRow.getCell(7).alignment = { horizontal: 'right' };
    totalRow.height = 20;

    const fileName = `prestacao-${collector.name.replace(/\s+/g, '-')}-${mesRef.replace('/', '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(400).json({ message: error.message || 'Erro ao gerar Excel.' });
  }
});

// CORRIGIDO: CSV agora aceita token via query param para permitir download direto
app.get('/reports/contracts.csv', auth(), async (req, res) => {
  const where = {};
  const rawContracts = await prisma.contract.findMany({
    where,
    include: {
      customer: true,
      installments: true,
      payments: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const contracts = await Promise.all(rawContracts.map(enrichContract));

  const rows = contracts.map((contract) => ({
    cliente: contract.customer.name,
    cpf: contract.customer.cpf,
    produto: contract.product,
    status: contract.status,
    parcelas: contract.installmentCount,
    pagas: contract.paidInstallments,
    restantes: contract.remainingInstallments,
    atrasadas: contract.overdueInstallments,
    valor_financiado: Number(contract.financedAmount).toFixed(2),
    total_com_juros: Number(contract.totalWithInterest).toFixed(2),
    saldo_pendente: Number(contract.pendingAmount).toFixed(2)
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio-contratos.csv');
  res.send(toCsv(rows));
});

app.get('/reports/payments.csv', auth(), async (req, res) => {
  const where = {};

  const payments = await prisma.payment.findMany({
    where,
    include: {
      contract: {
        include: {
          customer: true,
          }
      },
      collector: true,
      installment: true
    },
    orderBy: { paymentDate: 'desc' }
  });

  const rows = payments.map((payment) => ({
    cliente: payment.contract.customer.name,
    cpf: payment.contract.customer.cpf,
    produto: payment.contract.product,
    parcela: payment.installment ? payment.installment.number : '',
    valor: Number(payment.amount).toFixed(2),
    forma: payment.paymentMethod,
    data_pagamento: new Date(payment.paymentDate).toLocaleDateString('pt-BR'),
    cobrador: payment.collector.name,
    recibo: payment.receiptCode || ''
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio-pagamentos.csv');
  res.send(toCsv(rows));
});

app.get('/audit-logs', auth(['ADMIN']), async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  res.json(logs);
});


app.get('/dashboard/summary', auth(), async (req, res) => {

  // Datas em UTC puro — pagamentos são salvos como meia-noite UTC
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const monthEnd   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const dayStart   = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const dayEnd     = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  const contractsWhere =
    req.user.role === 'COLLECTOR'
      ? {
          assignments: {
            some: {
              collectorId: req.user.sub
            }
          }
        }
      : {};

  const contractsRaw = await prisma.contract.findMany({
    where: contractsWhere,
    include: {
      installments: true,
      payments: true
    }
  });

  const contracts = await Promise.all(contractsRaw.map(enrichContract));

  const assignmentsToday = await prisma.assignment.findMany({
    where: {
      assignedAt: { gte: dayStart, lte: dayEnd },
      ...(req.user.role === 'COLLECTOR' ? { collectorId: req.user.sub } : {})
    },
    include: { collector: { select: { id: true, name: true } } }
  });

  // Cobranças programadas para o mês — parcelas pendentes com vencimento no mês atual
  const cobrancasMes = await prisma.installment.count({
    where: {
      dueDate: { gte: monthStart, lte: monthEnd },
      status: { not: 'PAGO' },
      ...(req.user.role === 'COLLECTOR'
        ? { contract: { assignments: { some: { collectorId: req.user.sub } } } }
        : {})
    }
  });

  const valorCobrancasMes = await prisma.installment.aggregate({
    where: {
      dueDate: { gte: monthStart, lte: monthEnd },
      status: { not: 'PAGO' },
      ...(req.user.role === 'COLLECTOR'
        ? { contract: { assignments: { some: { collectorId: req.user.sub } } } }
        : {})
    },
    _sum: { amount: true }
  });

  const paymentsMonth = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: monthStart, lte: monthEnd },
      ...(req.user.role === 'COLLECTOR' ? { collectorId: req.user.sub } : {})
    },
    include: { collector: { select: { id: true, name: true } } }
  });

  const paymentsToday = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: dayStart, lte: dayEnd },
      ...(req.user.role === 'COLLECTOR' ? { collectorId: req.user.sub } : {})
    },
    include: { collector: { select: { id: true, name: true } } }
  });

  const valueReceivedMonth = Number(
    paymentsMonth.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)
  );

  const valueOpenMonth = Number(
    contracts.reduce((sum, contract) => sum + Number(contract.pendingAmount || 0), 0).toFixed(2)
  );

  const overdueInstallments = contracts.reduce(
    (sum, contract) => sum + Number(contract.overdueInstallments || 0),
    0
  );

  const customersInArrears = new Set(
    contracts.filter((c) => c.overdueInstallments > 0).map((c) => c.customerId)
  ).size;

  // Mapa mensal — total recebido no mês por cobrador
  const collectorMonthMap = new Map();

  for (const pay of paymentsMonth) {
    const item = collectorMonthMap.get(pay.collectorId) || {
      collectorId: pay.collectorId,
      collectorName: pay.collector?.name || '—',
      receivedMonth: 0,
      paymentsMonth: 0
    };
    item.receivedMonth += Number(pay.amount || 0);
    item.paymentsMonth += 1;
    collectorMonthMap.set(pay.collectorId, item);
  }

  // Mapa diário — total recebido hoje por cobrador (UTC puro)
  const collectorDayMap = new Map();

  for (const pay of paymentsToday) {
    const item = collectorDayMap.get(pay.collectorId) || {
      collectorId: pay.collectorId,
      collectorName: pay.collector?.name || '—',
      receivedToday: 0,
      paymentsToday: 0
    };
    item.receivedToday += Number(pay.amount || 0);
    item.paymentsToday += 1;
    collectorDayMap.set(pay.collectorId, item);
  }

  // Fundir os dois mapas — todos os cobradores que tiveram atividade no mês
  const collectorMap = new Map();
  for (const [id, m] of collectorMonthMap) {
    collectorMap.set(id, {
      collectorId: id,
      collectorName: m.collectorName,
      receivedMonth: m.receivedMonth,
      paymentsMonth: m.paymentsMonth,
      receivedToday: 0,
      paymentsToday: 0
    });
  }
  for (const [id, d] of collectorDayMap) {
    const existing = collectorMap.get(id) || {
      collectorId: id,
      collectorName: d.collectorName,
      receivedMonth: 0,
      paymentsMonth: 0
    };
    existing.receivedToday = d.receivedToday;
    existing.paymentsToday = d.paymentsToday;
    collectorMap.set(id, existing);
  }

  res.json({
    valueOpenMonth,
    valueReceivedMonth,
    missingToReceiveMonth: Number(Math.max(valueOpenMonth - valueReceivedMonth, 0).toFixed(2)),
    overdueInstallments,
    customersInArrears,
    collectorsPerformance: Array.from(collectorMap.values()).map((i) => ({
      ...i,
      receivedMonth: Number((i.receivedMonth || 0).toFixed(2)),
      receivedToday: Number((i.receivedToday || 0).toFixed(2))
    })),
    assignmentsToday: assignmentsToday.length,
    cobrancasMes,
    valorCobrancasMes: Number((valorCobrancasMes._sum.amount || 0).toFixed(2))
  });
});


// ════════════════════════════════════════════════════════════
// MÓDULO DE ESTOQUE
// ════════════════════════════════════════════════════════════

// ── Produtos ─────────────────────────────────────────────────

app.get('/products', auth(), async (req, res) => {
  try {
    const q = req.query.q?.toString() || '';
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q } } : {})
      },
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/products', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      unit: z.string().default('un'),
      packageUnit: z.string().optional().nullable(),
      packageQty: z.coerce.number().optional().nullable(),
      minStock: z.coerce.number().min(0).default(0),
      expiryDate: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);
    const product = await prisma.product.create({
      data: {
        ...data,
        expiryDate: data.expiryDate ? parseDate(data.expiryDate) : null,
      }
    });
    await writeAuditLog({ userId: req.user.sub, action: 'CREATE', entityType: 'PRODUCT', entityId: product.id, description: `Produto ${product.name} criado.` });
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/products/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      unit: z.string().default('un'),
      packageUnit: z.string().optional().nullable(),
      packageQty: z.coerce.number().optional().nullable(),
      minStock: z.coerce.number().min(0).default(0),
      expiryDate: z.string().optional().nullable(),
      isActive: z.boolean().optional().default(true),
    });
    const data = schema.parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...data,
        expiryDate: data.expiryDate ? parseDate(data.expiryDate) : null,
        updatedAt: new Date()
      }
    });
    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/products/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false, updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Movimentações de estoque ──────────────────────────────────

app.get('/stock/movements', auth(['ADMIN']), async (req, res) => {
  try {
    const productId = req.query.productId?.toString() || '';
    const type = req.query.type?.toString() || '';
    const month = Number(req.query.month) || 0;
    const year = Number(req.query.year) || 0;

    const where = {
      ...(productId ? { productId } : {}),
      ...(type ? { type } : {}),
      ...(month && year ? {
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lte: new Date(year, month, 0, 23, 59, 59, 999)
        }
      } : {})
    };

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, unit: true } },
        contract: { select: { id: true, product: true } },
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(movements);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/stock/movements', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      productId: z.string().min(1),
      type: z.enum(['ENTRADA', 'SAIDA', 'AVARIA', 'TROCA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']),
      quantity: z.coerce.number().positive(),
      unitCost: z.coerce.number().min(0).default(0),
      salePrice: z.coerce.number().min(0).optional().nullable(),
      destination: z.string().optional().nullable(),
      contractId: z.string().optional().nullable(),
      customerId: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    });

    const data = schema.parse(req.body);

    // Calcular margem se for saída com preço
    let margin = null;
    if (data.type === 'SAIDA' && data.salePrice && data.unitCost > 0) {
      margin = Number((((data.salePrice - data.unitCost) / data.salePrice) * 100).toFixed(2));
    }

    // Verificar estoque disponível para saída/avaria
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ message: 'Produto não encontrado.' });

    if (['SAIDA', 'AVARIA'].includes(data.type) && product.currentStock < data.quantity) {
      return res.status(400).json({ message: `Estoque insuficiente. Disponível: ${product.currentStock} ${product.unit}` });
    }

    // Criar movimentação
    const movement = await prisma.stockMovement.create({
      data: {
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        unitCost: data.unitCost,
        salePrice: data.salePrice ?? null,
        margin,
        destination: data.destination || null,
        contractId: data.contractId || null,
        customerId: data.customerId || null,
        reason: data.reason || null,
        notes: data.notes || null,
        userId: req.user.sub
      },
      include: {
        product: true,
        customer: { select: { id: true, name: true } },
        contract: { select: { id: true, product: true } },
        user: { select: { id: true, name: true } }
      }
    });

    // Atualizar estoque do produto
    const delta = ['ENTRADA', 'TROCA', 'AJUSTE_POSITIVO'].includes(data.type) ? data.quantity : -data.quantity;

    const productUpdate = { currentStock: { increment: delta }, updatedAt: new Date() };

    // Na ENTRADA: atualizar preços e recalcular cestas vinculadas
    if (data.type === 'ENTRADA' && data.unitCost > 0) {
      const oldCostPrice = product.costPrice;
      productUpdate.costPrice = data.unitCost;
      if (data.salePrice) productUpdate.salePrice = data.salePrice;

      // Registrar no histórico se o preço de custo mudou
      if (oldCostPrice !== data.unitCost) {
        await prisma.stockMovement.create({
          data: {
            productId: data.productId,
            type: 'AJUSTE_PRECO',
            quantity: 0,
            unitCost: data.unitCost,
            reason: `Preço de custo alterado de R$ ${oldCostPrice.toFixed(2)} para R$ ${data.unitCost.toFixed(2)} via entrada de estoque.`,
            userId: req.user.sub
          }
        });

        // Recalcular custo de todas as cestas que usam este produto
        const basketItems = await prisma.basketItem.findMany({
          where: { productId: data.productId },
          include: { basket: { include: { items: { include: { product: true } } } } }
        });

        const basketsToUpdate = new Map();
        for (const item of basketItems) {
          if (!basketsToUpdate.has(item.basketId)) {
            basketsToUpdate.set(item.basketId, item.basket);
          }
        }

        for (const [basketId, basket] of basketsToUpdate) {
          let newCostPrice = 0;
          for (const bItem of basket.items) {
            const itemCost = bItem.productId === data.productId ? data.unitCost : bItem.product.costPrice;
            newCostPrice += itemCost * bItem.quantity;
          }
          newCostPrice = Number(newCostPrice.toFixed(2));
          const newMargin = basket.salePrice > 0
            ? Number((((basket.salePrice - newCostPrice) / basket.salePrice) * 100).toFixed(2))
            : 0;

          await prisma.basket.update({
            where: { id: basketId },
            data: { costPrice: newCostPrice, margin: newMargin, updatedAt: new Date() }
          });

          // Registrar no histórico de cestas
          await prisma.basketMovement.create({
            data: {
              basketId,
              type: 'AJUSTE_PRECO',
              quantity: 0,
              unitCost: newCostPrice,
              reason: `Custo recalculado: ${product.name} alterou de R$ ${oldCostPrice.toFixed(2)} para R$ ${data.unitCost.toFixed(2)}. Novo custo da cesta: R$ ${newCostPrice.toFixed(2)}.`,
              userId: req.user.sub
            }
          });
        }
      }
    }

    await prisma.product.update({
      where: { id: data.productId },
      data: productUpdate
    });

    await writeAuditLog({
      userId: req.user.sub,
      action: data.type,
      entityType: 'STOCK',
      entityId: movement.id,
      description: `${data.type} de ${data.quantity} ${product.unit} de ${product.name}.`
    });

    res.status(201).json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Resumo do estoque ─────────────────────────────────────────

app.get('/stock/summary', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Produtos ativos com estoque
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    // Movimentações do mês
    const movements = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { product: { select: { name: true, unit: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // Totais do mês
    // Entradas reais: excluir estornos de desmontagem de cestas
    const entradas = movements.filter(m =>
      m.type === 'ENTRADA' &&
      !(m.reason && m.reason.includes('Estorno de montagem'))
    );
    // Saídas reais: excluir saídas para montagem de cestas
    const saidas = movements.filter(m =>
      m.type === 'SAIDA' &&
      !(m.destination && m.destination.includes('Montagem de'))
    );
    const avarias = movements.filter(m => m.type === 'AVARIA');
    const trocas = movements.filter(m => m.type === 'TROCA');

    const totalEntradaValor = entradas.reduce((s, m) => s + m.quantity * m.unitCost, 0);
    const totalSaidaValor = saidas.reduce((s, m) => s + m.quantity * (m.salePrice || m.unitCost), 0);
    const totalAvariaValor = avarias.reduce((s, m) => s + m.quantity * m.unitCost, 0);

    // Valor total do estoque atual
    const valorEstoque      = products.reduce((s, p) => s + p.currentStock * p.costPrice, 0);
    const valorEstoqueVenda = products.reduce((s, p) => s + p.currentStock * (p.salePrice || p.costPrice), 0);

    // Produtos com estoque baixo
    const estoqueBaixo = products.filter(p => p.currentStock <= p.minStock && p.minStock > 0);

    // Produtos com validade próxima (30 dias)
    const hoje = new Date();
    const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    const validadeProxima = products.filter(p => p.expiryDate && new Date(p.expiryDate) <= em30dias);

    res.json({
      month, year,
      produtos: products,
      movimentos: movements,
      totalEntradas: entradas.length,
      totalSaidas: saidas.length,
      totalAvarias: avarias.length,
      totalTrocas: trocas.length,
      totalEntradaValor: Number(totalEntradaValor.toFixed(2)),
      totalSaidaValor: Number(totalSaidaValor.toFixed(2)),
      totalAvariaValor: Number(totalAvariaValor.toFixed(2)),
      valorEstoque: Number(valorEstoque.toFixed(2)),
      valorEstoqueVenda: Number(valorEstoqueVenda.toFixed(2)),
      estoqueBaixo,
      validadeProxima
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// ════════════════════════════════════════════════════════════
// MÓDULO DE CESTAS BÁSICAS
// ════════════════════════════════════════════════════════════

// ── Listar cestas ─────────────────────────────────────────────
app.get('/baskets', auth(), async (req, res) => {
  try {
    const baskets = await prisma.basket.findMany({
      where: { isActive: true },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true, costPrice: true, currentStock: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(baskets);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Criar cesta ───────────────────────────────────────────────
app.post('/baskets', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      salePrice: z.coerce.number().min(0),
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.coerce.number().positive()
      })).min(1, 'Adicione pelo menos um produto.')
    });
    const data = schema.parse(req.body);

    // Buscar preços dos produtos para calcular custo
    const productIds = data.items.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    let costPrice = 0;
    for (const item of data.items) {
      const prod = products.find(p => p.id === item.productId);
      if (prod) costPrice += prod.costPrice * item.quantity;
    }
    costPrice = Number(costPrice.toFixed(2));

    const margin = data.salePrice > 0
      ? Number((((data.salePrice - costPrice) / data.salePrice) * 100).toFixed(2))
      : 0;

    const basket = await prisma.basket.create({
      data: {
        name: data.name,
        description: data.description || null,
        salePrice: data.salePrice,
        costPrice,
        margin,
        items: {
          create: data.items.map(i => ({
            productId: i.productId,
            quantity: i.quantity
          }))
        }
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, unit: true, costPrice: true } } } }
      }
    });

    await writeAuditLog({ userId: req.user.sub, action: 'CREATE', entityType: 'BASKET', entityId: basket.id, description: `Cesta ${basket.name} criada.` });
    res.status(201).json(basket);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Editar cesta ──────────────────────────────────────────────
app.put('/baskets/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      salePrice: z.coerce.number().min(0),
      isActive: z.boolean().optional().default(true),
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.coerce.number().positive()
      })).min(1)
    });
    const data = schema.parse(req.body);

    const productIds = data.items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

    let costPrice = 0;
    for (const item of data.items) {
      const prod = products.find(p => p.id === item.productId);
      if (prod) costPrice += prod.costPrice * item.quantity;
    }
    costPrice = Number(costPrice.toFixed(2));
    const margin = data.salePrice > 0
      ? Number((((data.salePrice - costPrice) / data.salePrice) * 100).toFixed(2))
      : 0;

    // Deletar itens antigos e recriar
    await prisma.basketItem.deleteMany({ where: { basketId: req.params.id } });

    const basket = await prisma.basket.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description || null,
        salePrice: data.salePrice,
        costPrice,
        margin,
        isActive: data.isActive,
        updatedAt: new Date(),
        items: {
          create: data.items.map(i => ({ productId: i.productId, quantity: i.quantity }))
        }
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, unit: true, costPrice: true } } } }
      }
    });

    res.json(basket);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Excluir cesta ─────────────────────────────────────────────
app.delete('/baskets/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.basket.update({
      where: { id: req.params.id },
      data: { isActive: false, updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Movimentações de cestas ───────────────────────────────────
app.post('/baskets/movements', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      basketId: z.string(),
      type: z.enum(['MONTAGEM', 'VENDA', 'DESMONTAGEM', 'AVARIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']),
      quantity: z.coerce.number().positive(),
      salePrice: z.coerce.number().min(0).optional().nullable(),
      destination: z.string().optional().nullable(),
      customerId: z.string().optional().nullable(),
      contractId: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const basket = await prisma.basket.findUnique({
      where: { id: data.basketId },
      include: { items: { include: { product: true } } }
    });
    if (!basket) return res.status(404).json({ message: 'Cesta não encontrada.' });

    const requestingUser = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!requestingUser) return res.status(401).json({ message: 'Usuário não encontrado.' });

    // Validações de estoque
    if (data.type === 'MONTAGEM') {
      // Verificar se há produtos suficientes para montar N cestas
      for (const item of basket.items) {
        const needed = item.quantity * data.quantity;
        if (item.product.currentStock < needed) {
          return res.status(400).json({
            message: `Estoque insuficiente de "${item.product.name}". Necessário: ${needed} ${item.product.unit}, disponível: ${item.product.currentStock}`
          });
        }
      }
    } else if (['VENDA', 'AVARIA', 'DESMONTAGEM', 'AJUSTE_NEGATIVO'].includes(data.type)) {
      if (basket.currentStock < data.quantity) {
        return res.status(400).json({
          message: `Estoque de cestas insuficiente. Disponível: ${basket.currentStock}`
        });
      }
    }

    const margin = data.salePrice && basket.costPrice > 0
      ? Number((((data.salePrice - basket.costPrice) / data.salePrice) * 100).toFixed(2))
      : null;

    // Registrar movimentação
    const movement = await prisma.basketMovement.create({
      data: {
        basketId: data.basketId,
        type: data.type,
        quantity: data.quantity,
        unitCost: basket.costPrice,
        salePrice: data.salePrice ?? null,
        margin,
        destination: data.destination || null,
        customerId: data.customerId || null,
        contractId: data.contractId || null,
        reason: data.reason || null,
        notes: data.notes || null,
        userId: req.user.sub
      }
    });

    // Atualizar estoque da cesta
    if (data.type === 'MONTAGEM') {
      // Baixar produtos componentes
      for (const item of basket.items) {
        const delta = -(item.quantity * data.quantity);
        await prisma.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: delta }, updatedAt: new Date() }
        });
        // Registrar saída no estoque de produtos
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'SAIDA',
            quantity: item.quantity * data.quantity,
            unitCost: item.product.costPrice,
            destination: `Montagem de ${data.quantity}x ${basket.name}`,
            userId: req.user.sub
          }
        });
      }
      // Aumentar estoque de cestas
      await prisma.basket.update({ where: { id: data.basketId }, data: { currentStock: { increment: data.quantity } } });
    } else if (data.type === 'DESMONTAGEM') {
      // Devolver produtos ao estoque
      for (const item of basket.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity * data.quantity }, updatedAt: new Date() }
        });
      }
      await prisma.basket.update({ where: { id: data.basketId }, data: { currentStock: { increment: -data.quantity } } });
    } else if (data.type === 'AJUSTE_POSITIVO') {
      await prisma.basket.update({ where: { id: data.basketId }, data: { currentStock: { increment: data.quantity } } });
    } else {
      // VENDA, AVARIA ou AJUSTE_NEGATIVO — só baixa estoque de cestas
      await prisma.basket.update({ where: { id: data.basketId }, data: { currentStock: { increment: -data.quantity } } });
    }

    await writeAuditLog({ userId: req.user.sub, action: data.type, entityType: 'BASKET', entityId: basket.id, description: `${data.type} de ${data.quantity}x ${basket.name}.` });
    res.status(201).json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Resumo de cestas ──────────────────────────────────────────
app.get('/baskets/summary', auth(['ADMIN']), async (req, res) => {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const baskets = await prisma.basket.findMany({
      where: { isActive: true },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      orderBy: { name: 'asc' }
    });

    const movements = await prisma.basketMovement.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        basket: { select: { name: true } },
        customer: { select: { name: true } },
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const montagens = movements.filter(m => m.type === 'MONTAGEM');
    const vendas    = movements.filter(m => m.type === 'VENDA');
    const avarias   = movements.filter(m => m.type === 'AVARIA');

    const totalMontadas  = montagens.reduce((s, m) => s + m.quantity, 0);
    const totalVendidas  = vendas.reduce((s, m) => s + m.quantity, 0);
    const totalVendaValor = vendas.reduce((s, m) => s + m.quantity * (m.salePrice || m.unitCost), 0);
    const totalCustoValor = montagens.reduce((s, m) => s + m.quantity * m.unitCost, 0);
    const valorEstoque      = baskets.reduce((s, b) => s + b.currentStock * b.costPrice, 0);
    const valorEstoqueVenda = baskets.reduce((s, b) => s + b.currentStock * (b.salePrice || b.costPrice), 0);

    res.json({
      month, year,
      cestas: baskets,
      movimentos: movements,
      totalMontadas,
      totalVendidas,
      totalAvarias: avarias.reduce((s, m) => s + m.quantity, 0),
      totalVendaValor: Number(totalVendaValor.toFixed(2)),
      totalCustoValor: Number(totalCustoValor.toFixed(2)),
      valorEstoque: Number(valorEstoque.toFixed(2)),
      valorEstoqueVenda: Number(valorEstoqueVenda.toFixed(2)),
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// ── Ajuste de estoque de produto ──────────────────────────────
app.post('/stock/movements/adjust', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      productId: z.string(),
      type: z.enum(['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']),
      quantity: z.coerce.number().positive(),
      reason: z.string().min(1, 'Motivo obrigatório.'),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ message: 'Produto não encontrado.' });

    if (data.type === 'AJUSTE_NEGATIVO' && product.currentStock < data.quantity) {
      return res.status(400).json({ message: `Estoque insuficiente. Disponível: ${product.currentStock} ${product.unit}` });
    }

    const delta = data.type === 'AJUSTE_POSITIVO' ? data.quantity : -data.quantity;

    const movement = await prisma.stockMovement.create({
      data: {
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        unitCost: product.costPrice,
        reason: data.reason,
        notes: data.notes || null,
        userId: req.user.sub
      }
    });

    await prisma.product.update({
      where: { id: data.productId },
      data: { currentStock: { increment: delta }, updatedAt: new Date() }
    });

    await writeAuditLog({ userId: req.user.sub, action: data.type, entityType: 'STOCK', entityId: movement.id, description: `Ajuste de ${data.quantity} ${product.unit} em ${product.name}: ${data.reason}` });
    res.status(201).json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Editar movimentação de estoque ────────────────────────────
app.put('/stock/movements/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      quantity: z.coerce.number().positive(),
      unitCost: z.coerce.number().min(0).optional(),
      salePrice: z.coerce.number().min(0).optional().nullable(),
      destination: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const existing = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: true }
    });
    if (!existing) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    // Reverter efeito antigo no estoque
    const oldDelta = ['ENTRADA', 'AJUSTE_POSITIVO', 'TROCA'].includes(existing.type)
      ? -existing.quantity
      : existing.quantity;

    // Aplicar novo efeito
    const newDelta = ['ENTRADA', 'AJUSTE_POSITIVO', 'TROCA'].includes(existing.type)
      ? data.quantity
      : -data.quantity;

    const totalDelta = oldDelta + newDelta;

    // Verificar se estoque não ficará negativo
    const newStock = existing.product.currentStock + totalDelta;
    if (newStock < 0) {
      return res.status(400).json({ message: `Edição resultaria em estoque negativo (${newStock}).` });
    }

    let margin = existing.margin;
    if (data.salePrice && data.unitCost) {
      margin = Number((((data.salePrice - data.unitCost) / data.salePrice) * 100).toFixed(2));
    }

    const movement = await prisma.stockMovement.update({
      where: { id: req.params.id },
      data: {
        quantity: data.quantity,
        unitCost: data.unitCost ?? existing.unitCost,
        salePrice: data.salePrice ?? existing.salePrice,
        margin,
        destination: data.destination ?? existing.destination,
        reason: data.reason ?? existing.reason,
        notes: data.notes ?? existing.notes,
      }
    });

    await prisma.product.update({
      where: { id: existing.productId },
      data: { currentStock: { increment: totalDelta }, updatedAt: new Date() }
    });

    res.json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Ajuste de estoque de cesta ────────────────────────────────
app.post('/baskets/movements/adjust', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      basketId: z.string(),
      type: z.enum(['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']),
      quantity: z.coerce.number().positive(),
      reason: z.string().min(1, 'Motivo obrigatório.'),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const basket = await prisma.basket.findUnique({ where: { id: data.basketId } });
    if (!basket) return res.status(404).json({ message: 'Cesta não encontrada.' });

    if (data.type === 'AJUSTE_NEGATIVO' && basket.currentStock < data.quantity) {
      return res.status(400).json({ message: `Estoque insuficiente. Disponível: ${basket.currentStock}` });
    }

    const delta = data.type === 'AJUSTE_POSITIVO' ? data.quantity : -data.quantity;

    const movement = await prisma.basketMovement.create({
      data: {
        basketId: data.basketId,
        type: data.type,
        quantity: data.quantity,
        unitCost: basket.costPrice,
        reason: data.reason,
        notes: data.notes || null,
        userId: req.user.sub
      }
    });

    await prisma.basket.update({
      where: { id: data.basketId },
      data: { currentStock: { increment: delta } }
    });

    await writeAuditLog({ userId: req.user.sub, action: data.type, entityType: 'BASKET', entityId: basket.id, description: `Ajuste de ${data.quantity}x ${basket.name}: ${data.reason}` });
    res.status(201).json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Editar movimentação de cesta ──────────────────────────────
app.put('/baskets/movements/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({
      quantity: z.coerce.number().positive(),
      salePrice: z.coerce.number().min(0).optional().nullable(),
      destination: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const existing = await prisma.basketMovement.findUnique({
      where: { id: req.params.id },
      include: { basket: true }
    });
    if (!existing) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    // Reverter efeito antigo e aplicar novo
    const wasPositive = ['MONTAGEM', 'AJUSTE_POSITIVO'].includes(existing.type);
    const oldDelta = wasPositive ? -existing.quantity : existing.quantity;
    const newDelta = wasPositive ? data.quantity : -data.quantity;
    const totalDelta = oldDelta + newDelta;

    const newStock = existing.basket.currentStock + totalDelta;
    if (newStock < 0) {
      return res.status(400).json({ message: `Edição resultaria em estoque negativo (${newStock}).` });
    }

    const movement = await prisma.basketMovement.update({
      where: { id: req.params.id },
      data: {
        quantity: data.quantity,
        salePrice: data.salePrice ?? existing.salePrice,
        destination: data.destination ?? existing.destination,
        reason: data.reason ?? existing.reason,
        notes: data.notes ?? existing.notes,
      }
    });

    await prisma.basket.update({
      where: { id: existing.basketId },
      data: { currentStock: { increment: totalDelta } }
    });

    res.json(movement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// ── packageUnit e packageQty no schema de produtos ───────────
// (já aceita via z.string().optional() no PUT/POST existente)

// ── Histórico de cestas (sem filtro de mês) ───────────────────
app.get('/baskets/history', auth(['ADMIN']), async (req, res) => {
  try {
    const basketId = req.query.basketId?.toString() || '';
    const type = req.query.type?.toString() || '';
    const movements = await prisma.basketMovement.findMany({
      where: {
        ...(basketId ? { basketId } : {}),
        ...(type ? { type } : {})
      },
      include: {
        basket: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(movements);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Estorno de movimentação de estoque ────────────────────────
app.post('/stock/movements/:id/reverse', auth(['ADMIN']), async (req, res) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: true }
    });
    if (!movement) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    // Reverter: se era ENTRADA/AJUSTE_POSITIVO/TROCA → retirar; se era SAIDA/AVARIA/AJUSTE_NEGATIVO → devolver
    const isPositive = ['ENTRADA', 'AJUSTE_POSITIVO', 'TROCA'].includes(movement.type);
    const delta = isPositive ? -movement.quantity : movement.quantity;

    if (!isPositive && movement.product.currentStock + movement.quantity < 0) {
      return res.status(400).json({ message: 'Estorno resultaria em estoque negativo.' });
    }

    // Criar movimentação de estorno
    await prisma.stockMovement.create({
      data: {
        productId: movement.productId,
        type: `ESTORNO`,
        quantity: movement.quantity,
        unitCost: movement.unitCost,
        reason: `Estorno da movimentação ${movement.id} (${movement.type})`,
        userId: req.user.sub
      }
    });

    await prisma.product.update({
      where: { id: movement.productId },
      data: { currentStock: { increment: delta }, updatedAt: new Date() }
    });

    await writeAuditLog({ userId: req.user.sub, action: 'ESTORNO', entityType: 'STOCK', entityId: movement.id, description: `Estorno de ${movement.quantity} de ${movement.product.name}.` });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Exclusão de movimentação de estoque (sem reverter estoque) ─
app.delete('/stock/movements/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.stockMovement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Estorno de movimentação de cesta ──────────────────────────
app.post('/baskets/movements/:id/reverse', auth(['ADMIN']), async (req, res) => {
  try {
    const movement = await prisma.basketMovement.findUnique({
      where: { id: req.params.id },
      include: { basket: true }
    });
    if (!movement) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    const isPositive = ['MONTAGEM', 'AJUSTE_POSITIVO'].includes(movement.type);
    const delta = isPositive ? -movement.quantity : movement.quantity;

    if (delta < 0 && movement.basket.currentStock + delta < 0) {
      return res.status(400).json({ message: 'Estorno resultaria em estoque negativo.' });
    }

    await prisma.basketMovement.create({
      data: {
        basketId: movement.basketId,
        type: 'ESTORNO',
        quantity: movement.quantity,
        unitCost: movement.unitCost,
        reason: `Estorno da movimentação ${movement.id} (${movement.type})`,
        userId: req.user.sub
      }
    });

    await prisma.basket.update({
      where: { id: movement.basketId },
      data: { currentStock: { increment: delta } }
    });

    await writeAuditLog({ userId: req.user.sub, action: 'ESTORNO', entityType: 'BASKET', entityId: movement.id, description: `Estorno de ${movement.quantity}x ${movement.basket.name}.` });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Exclusão de movimentação de cesta (sem reverter estoque) ──
app.delete('/baskets/movements/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.basketMovement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// ── Excluir movimentação de estoque com estorno limpo ────────
app.delete('/stock/movements/:id/delete-with-reverse', auth(['ADMIN']), async (req, res) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { basketItems: { include: { basket: { include: { items: { include: { product: true } } } } } } } } }
    });
    if (!movement) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    // Reverter o estoque do produto
    const isPositive = ['ENTRADA', 'AJUSTE_POSITIVO', 'TROCA'].includes(movement.type);
    const delta = isPositive ? -movement.quantity : movement.quantity;

    await prisma.product.update({
      where: { id: movement.productId },
      data: { currentStock: { increment: delta }, updatedAt: new Date() }
    });

    // Se era uma ENTRADA que saiu de cestas (MONTAGEM), reverter também o estoque de cestas
    if (movement.type === 'SAIDA' && movement.destination && movement.destination.includes('Montagem')) {
      // Tentar extrair quantidade de cestas do destino: "Montagem de Nx Nome"
      const match = movement.destination.match(/Montagem de (\d+)x/);
      if (match) {
        const qtdCestas = Number(match[1]);
        // Encontrar cestas que usam este produto
        for (const basketItem of movement.product.basketItems || []) {
          // Reverter: devolve produto ao estoque (já feito acima) e desconta cestas montadas
          await prisma.basket.update({
            where: { id: basketItem.basketId },
            data: { currentStock: { increment: -qtdCestas } }
          });
        }
      }
    }

    // Excluir o registro
    await prisma.stockMovement.delete({ where: { id: req.params.id } });

    await writeAuditLog({ userId: req.user.sub, action: 'DELETE', entityType: 'STOCK', entityId: req.params.id, description: `Movimentação excluída com estorno de ${movement.quantity} de ${movement.product.name}.` });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── Excluir movimentação de cesta com estorno limpo ───────────
app.delete('/baskets/movements/:id/delete-with-reverse', auth(['ADMIN']), async (req, res) => {
  try {
    const movement = await prisma.basketMovement.findUnique({
      where: { id: req.params.id },
      include: { basket: { include: { items: { include: { product: true } } } } }
    });
    if (!movement) return res.status(404).json({ message: 'Movimentação não encontrada.' });

    const isPositive = ['MONTAGEM', 'AJUSTE_POSITIVO'].includes(movement.type);
    const delta = isPositive ? -movement.quantity : movement.quantity;

    // Reverter estoque da cesta
    await prisma.basket.update({
      where: { id: movement.basketId },
      data: { currentStock: { increment: delta } }
    });

    // Se era MONTAGEM: devolver produtos ao estoque de produtos
    if (movement.type === 'MONTAGEM') {
      for (const item of movement.basket.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity * movement.quantity }, updatedAt: new Date() }
        });
        // Registrar estorno no histórico de produtos
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'ENTRADA',
            quantity: item.quantity * movement.quantity,
            unitCost: item.product.costPrice,
            reason: `Estorno de montagem de ${movement.quantity}x ${movement.basket.name} (exclusão de histórico)`,
            userId: req.user.sub
          }
        });
      }
    }

    // Excluir o registro
    await prisma.basketMovement.delete({ where: { id: req.params.id } });

    await writeAuditLog({ userId: req.user.sub, action: 'DELETE', entityType: 'BASKET', entityId: req.params.id, description: `Movimentação excluída com estorno de ${movement.quantity}x ${movement.basket.name}.` });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// ════════════════════════════════════════════════════════════
// MÓDULO SPC
// ════════════════════════════════════════════════════════════

app.get('/spc', auth(['ADMIN']), async (req, res) => {
  try {
    const status = req.query.status?.toString() || '';
    const q = req.query.q?.toString() || '';
    const records = await prisma.spcRecord.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ customer: { name: { contains: q } } }, { customer: { cpf: { contains: q } } }] } : {})
      },
      include: {
        customer: { select: { id: true, name: true, cpf: true, phone1: true, phone2: true } },
        contract: { select: { id: true, product: true, financedAmount: true } },
        createdBy: { select: { id: true, name: true } },
        agreements: true
      },
      orderBy: { includeDate: 'desc' }
    });
    res.json(records);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.get('/spc/summary', auth(['ADMIN']), async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    const alertDate  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [ativos, baixadosMes] = await Promise.all([
      prisma.spcRecord.findMany({ where: { status: { not: 'BAIXADO' } } }),
      prisma.spcRecord.findMany({ where: { status: 'BAIXADO', removedDate: { gte: monthStart, lte: monthEnd } } }),
    ]);
    const vencendo = await prisma.spcRecord.findMany({ where: { status: 'ATIVO', expireDate: { lte: alertDate } } });
    const totalAtivos    = ativos.filter(r => r.status === 'ATIVO').length;
    const totalAcordos   = ativos.filter(r => r.status === 'ACORDO').length;
    const valorTotal     = ativos.reduce((s, r) => s + r.debtAmount, 0);
    const valorOriginal  = ativos.reduce((s, r) => s + r.originalDebt, 0);
    const valorBaixadoMes = baixadosMes.reduce((s, r) => s + r.originalDebt, 0);
    const taxaRecuperacao = valorOriginal > 0 ? Number(((valorBaixadoMes / valorOriginal) * 100).toFixed(1)) : 0;
    res.json({ totalAtivos, totalAcordos, totalBaixadosMes: baixadosMes.length, valorTotal: Number(valorTotal.toFixed(2)), valorOriginal: Number(valorOriginal.toFixed(2)), valorBaixadoMes: Number(valorBaixadoMes.toFixed(2)), taxaRecuperacao, vencendo: vencendo.length });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/spc', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({ customerId: z.string().min(1), contractId: z.string().optional().nullable(), debtAmount: z.coerce.number().positive(), reason: z.string().optional().nullable(), notes: z.string().optional().nullable(), includeDate: z.string().optional().nullable() });
    const data = schema.parse(req.body);
    const existing = await prisma.spcRecord.findFirst({ where: { customerId: data.customerId, status: { not: 'BAIXADO' } } });
    if (existing) return res.status(400).json({ message: 'Este cliente ja possui um registro ativo no SPC.' });
    const includeDate = data.includeDate ? new Date(data.includeDate) : new Date();
    const expireDate  = new Date(includeDate);
    expireDate.setFullYear(expireDate.getFullYear() + 5);
    const record = await prisma.spcRecord.create({ data: { customerId: data.customerId, contractId: data.contractId || null, debtAmount: data.debtAmount, originalDebt: data.debtAmount, reason: data.reason || null, notes: data.notes || null, includeDate, expireDate, createdById: req.user.sub }, include: { customer: { select: { id: true, name: true, cpf: true } }, agreements: true } });
    await writeAuditLog({ userId: req.user.sub, action: 'CREATE', entityType: 'SPC', entityId: record.id, description: `Cliente ${record.customer.name} incluido no SPC. Divida: R$ ${data.debtAmount.toFixed(2)}` });
    res.status(201).json(record);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.put('/spc/:id/baixar', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({ removedReason: z.string().min(1), notes: z.string().optional().nullable() });
    const data = schema.parse(req.body);

    const spcRecord = await prisma.spcRecord.findUnique({ where: { id: req.params.id }, include: { customer: true } });
    if (!spcRecord) return res.status(404).json({ message: 'Registro não encontrado.' });

    const record = await prisma.spcRecord.update({ where: { id: req.params.id }, data: { status: 'BAIXADO', removedDate: new Date(), removedReason: data.removedReason, notes: data.notes || null, updatedAt: new Date() }, include: { customer: true } });

    // Creditar saldo baixado nas parcelas atrasadas do contrato vinculado
    if (spcRecord.contractId) {
      try {
        const contract = await prisma.contract.findUnique({
          where: { id: spcRecord.contractId },
          include: { installments: { orderBy: { number: 'asc' } } }
        });
        if (contract) {
          const pendingInstallments = contract.installments.filter(i => {
            const st = normalizeInstallmentStatus(i);
            return st === 'ATRASADA' || st === 'PARCIAL' || st === 'PENDENTE';
          });
          let remaining = Number(spcRecord.debtAmount);
          const today = new Date();
          for (const inst of pendingInstallments) {
            if (remaining <= 0) break;
            const instBalance = Number((Number(inst.amount) - Number(inst.paidAmount || 0)).toFixed(2));
            if (instBalance <= 0) continue;
            const toPay = Number(Math.min(remaining, instBalance).toFixed(2));
            const newPaidAmount = Number((Number(inst.paidAmount || 0) + toPay).toFixed(2));
            await prisma.installment.update({
              where: { id: inst.id },
              data: {
                paidAmount: newPaidAmount,
                paidAt: newPaidAmount >= Number(inst.amount) - 0.01 ? today : null,
                status: normalizeInstallmentStatus({ ...inst, paidAmount: newPaidAmount }),
                updatedAt: today
              }
            });
            await prisma.payment.create({
              data: {
                contractId: spcRecord.contractId,
                installmentId: inst.id,
                collectorId: req.user.sub,
                amount: toPay,
                paymentDate: today,
                paymentMethod: 'DINHEIRO',
                notes: `Crédito de baixa SPC — ${data.removedReason}`,
                receiptCode: `SPC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
              }
            });
            remaining = Number((remaining - toPay).toFixed(2));
          }
          const updatedContract = await prisma.contract.findUnique({ where: { id: spcRecord.contractId }, include: { installments: true } });
          await prisma.contract.update({ where: { id: spcRecord.contractId }, data: { status: normalizeContractStatus(updatedContract), updatedAt: today } });
        }
      } catch (payError) {
        console.error('Erro ao aplicar crédito SPC no contrato:', payError.message);
      }
    }

    await writeAuditLog({ userId: req.user.sub, action: 'UPDATE', entityType: 'SPC', entityId: record.id, description: `SPC baixado para ${record.customer.name}. Motivo: ${data.removedReason}` });
    res.json(record);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post('/spc/:id/acordo', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({ agreedAmount: z.coerce.number().positive(), installments: z.coerce.number().int().min(1).default(1), dueDate: z.string(), notes: z.string().optional().nullable() });
    const data = schema.parse(req.body);
    const agreement = await prisma.spcAgreement.create({ data: { spcRecordId: req.params.id, agreedAmount: data.agreedAmount, installments: data.installments, dueDate: new Date(data.dueDate), notes: data.notes || null } });
    await prisma.spcRecord.update({ where: { id: req.params.id }, data: { status: 'ACORDO', updatedAt: new Date() } });
    res.status(201).json(agreement);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.put('/spc/:id', auth(['ADMIN']), async (req, res) => {
  try {
    const schema = z.object({ debtAmount: z.coerce.number().positive(), reason: z.string().optional().nullable(), notes: z.string().optional().nullable() });
    const data = schema.parse(req.body);
    const record = await prisma.spcRecord.update({ where: { id: req.params.id }, data: { debtAmount: data.debtAmount, reason: data.reason || null, notes: data.notes || null, updatedAt: new Date() } });
    res.json(record);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.delete('/spc/:id', auth(['ADMIN']), async (req, res) => {
  try {
    await prisma.spcRecord.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://0.0.0.0:${PORT}`);
});
