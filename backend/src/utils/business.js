'use strict';

// ── Parsing de data ──────────────────────────────────────────────────────────
// Salva como meia-noite UTC para que o frontend (dayjs.utc) não perca o dia.
function parseDate(str) {
  if (!str) return null;
  const dateOnly = str.split('T')[0];
  return new Date(dateOnly + 'T00:00:00.000Z');
}

// ── Validação de CPF (algoritmo dos dígitos verificadores) ───────────────────
function isValidCpf(cpf) {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais: 00000000000, etc.
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10 || d1 === 11) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10 || d2 === 11) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

// ── Mensagem de erro segura ──────────────────────────────────────────────────
// Expõe erros de validação (Zod) e de negócio; mascara internos em produção.
function safeErrorMessage(error, fallback) {
  if (error?.name === 'ZodError') return error.message;
  if (error?.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'campo';
    return `Já existe um registro com este ${field}.`;
  }
  if (error?.code === 'P2025') return fallback;
  if (process.env.NODE_ENV !== 'production') return error?.message || fallback;
  return fallback;
}

// ── Cálculo do total do contrato com juros ───────────────────────────────────
function calcContractTotal(contract) {
  const interestFactor = 1 + Number(contract.interestRate || 0) / 100;
  return Number((Number(contract.financedAmount || 0) * interestFactor).toFixed(2));
}

// ── Status de parcela ────────────────────────────────────────────────────────
function normalizeInstallmentStatus(installment) {
  const today = new Date();
  const fullyPaid = Number(installment.paidAmount || 0) >= Number(installment.amount || 0);

  if (fullyPaid) return 'PAGA';
  if (Number(installment.paidAmount || 0) > 0) return 'PARCIAL';
  if (new Date(installment.dueDate) < today) return 'ATRASADA';
  return 'PENDENTE';
}

// ── Status de contrato ───────────────────────────────────────────────────────
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

// ── Geração de parcelas ──────────────────────────────────────────────────────
// Parcela 1 = 30 dias após início, parcela 2 = 60 dias, etc.
function buildInstallments(contractStartDate, installmentCount, totalValue) {
  const amount = Number((totalValue / installmentCount).toFixed(2));
  const installments = [];

  for (let i = 1; i <= installmentCount; i += 1) {
    const dueDate = new Date(contractStartDate);
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

// ── CSV ──────────────────────────────────────────────────────────────────────
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

// ── Formata número como decimal (2 casas) ───────────────────────────────────
function moneyLike(value) {
  return Number(value || 0).toFixed(2);
}

// ── Status HTTP dinâmico para erros ─────────────────────────────
function getErrorStatus(error) {
  if (error?.name === 'ZodError') return 422;
  if (error?.code === 'P2002') return 409; // unique constraint
  if (error?.code === 'P2025') return 404; // record not found
  if (error?.code === 'P2003') return 409; // foreign key constraint
  return 500;
}

module.exports = {
  parseDate,
  isValidCpf,
  safeErrorMessage,
  calcContractTotal,
  normalizeInstallmentStatus,
  normalizeContractStatus,
  buildInstallments,
  toCsv,
  moneyLike,
  getErrorStatus
};
