'use strict';

const {
  isValidCpf,
  calcContractTotal,
  buildInstallments,
  normalizeInstallmentStatus,
  normalizeContractStatus,
  parseDate,
  toCsv,
  moneyLike,
  safeErrorMessage,
  getErrorStatus
} = require('../utils/business');

// ── isValidCpf ───────────────────────────────────────────────────────────────
describe('isValidCpf', () => {
  it('aceita CPFs válidos conhecidos', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
    expect(isValidCpf('12345678909')).toBe(true);
    expect(isValidCpf('98765432100')).toBe(true);
  });

  it('rejeita CPFs com todos os dígitos iguais', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('99999999999')).toBe(false);
  });

  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCpf('52998224726')).toBe(false); // último dígito errado
    expect(isValidCpf('52998224715')).toBe(false); // penúltimo errado
  });

  it('rejeita CPF com formato inválido', () => {
    expect(isValidCpf('529.982.247-25')).toBe(false); // com pontuação
    expect(isValidCpf('1234567890')).toBe(false);      // 10 dígitos
    expect(isValidCpf('123456789012')).toBe(false);    // 12 dígitos
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('abcdefghijk')).toBe(false);
  });
});

// ── calcContractTotal ────────────────────────────────────────────────────────
describe('calcContractTotal', () => {
  it('retorna o valor financiado quando juros é zero', () => {
    expect(calcContractTotal({ financedAmount: 1000, interestRate: 0 })).toBe(1000);
  });

  it('aplica juros corretamente', () => {
    expect(calcContractTotal({ financedAmount: 1000, interestRate: 10 })).toBe(1100);
    expect(calcContractTotal({ financedAmount: 500, interestRate: 20 })).toBe(600);
  });

  it('arredonda para 2 casas decimais', () => {
    expect(calcContractTotal({ financedAmount: 100, interestRate: 3 })).toBe(103);
    const result = calcContractTotal({ financedAmount: 100.5, interestRate: 2.5 });
    expect(result).toBe(103.01);
  });

  it('trata valores ausentes como zero', () => {
    expect(calcContractTotal({})).toBe(0);
    expect(calcContractTotal({ financedAmount: null, interestRate: null })).toBe(0);
  });
});

// ── buildInstallments ────────────────────────────────────────────────────────
describe('buildInstallments', () => {
  it('gera o número correto de parcelas', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    expect(buildInstallments(start, 3, 300).length).toBe(3);
    expect(buildInstallments(start, 12, 1200).length).toBe(12);
  });

  it('parcelas têm números sequenciais a partir de 1', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const installments = buildInstallments(start, 3, 300);
    expect(installments.map((i) => i.number)).toEqual([1, 2, 3]);
  });

  it('soma das parcelas é igual ao total', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const total = 1000;
    const installments = buildInstallments(start, 3, total);
    const sum = installments.reduce((s, i) => s + i.amount, 0);
    expect(Math.abs(sum - total)).toBeLessThan(0.01); // tolerância de centavo
  });

  it('a última parcela absorve o arredondamento', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const installments = buildInstallments(start, 3, 100); // 33.33, 33.33, 33.34
    const sum = installments.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(100);
  });

  it('vencimento da 1ª parcela é 1 mês após o início', () => {
    const start = new Date('2024-01-15T00:00:00.000Z');
    const installments = buildInstallments(start, 2, 200);
    expect(installments[0].dueDate.getMonth()).toBe(1); // fevereiro (0-based)
    expect(installments[1].dueDate.getMonth()).toBe(2); // março
  });
});

// ── normalizeInstallmentStatus ────────────────────────────────────────────────
describe('normalizeInstallmentStatus', () => {
  it('retorna PAGA quando paidAmount >= amount', () => {
    expect(normalizeInstallmentStatus({ paidAmount: 100, amount: 100, dueDate: new Date('2020-01-01') })).toBe('PAGA');
    expect(normalizeInstallmentStatus({ paidAmount: 110, amount: 100, dueDate: new Date('2020-01-01') })).toBe('PAGA');
  });

  it('retorna PARCIAL quando há pagamento parcial sem quitar', () => {
    const future = new Date(Date.now() + 86400000);
    expect(normalizeInstallmentStatus({ paidAmount: 50, amount: 100, dueDate: future })).toBe('PARCIAL');
  });

  it('retorna ATRASADA quando vencida e sem pagamento', () => {
    expect(normalizeInstallmentStatus({ paidAmount: 0, amount: 100, dueDate: new Date('2020-01-01') })).toBe('ATRASADA');
  });

  it('retorna PENDENTE quando vencimento futuro sem pagamento', () => {
    const future = new Date(Date.now() + 86400000 * 30);
    expect(normalizeInstallmentStatus({ paidAmount: 0, amount: 100, dueDate: future })).toBe('PENDENTE');
  });
});

// ── normalizeContractStatus ───────────────────────────────────────────────────
describe('normalizeContractStatus', () => {
  it('retorna ATIVO quando não tem parcelas', () => {
    expect(normalizeContractStatus({ installments: [] })).toBe('ATIVO');
  });

  it('retorna QUITADO quando todas as parcelas estão pagas', () => {
    const installments = [
      { paidAmount: 100, amount: 100, dueDate: new Date('2020-01-01') },
      { paidAmount: 100, amount: 100, dueDate: new Date('2020-02-01') }
    ];
    expect(normalizeContractStatus({ installments })).toBe('QUITADO');
  });

  it('retorna ATRASADO quando alguma parcela está atrasada', () => {
    const installments = [
      { paidAmount: 100, amount: 100, dueDate: new Date('2020-01-01') },
      { paidAmount: 0, amount: 100, dueDate: new Date('2020-02-01') }   // atrasada
    ];
    expect(normalizeContractStatus({ installments })).toBe('ATRASADO');
  });

  it('retorna ATIVO quando todas pendentes mas no prazo', () => {
    const future = new Date(Date.now() + 86400000 * 30);
    const installments = [
      { paidAmount: 0, amount: 100, dueDate: future },
      { paidAmount: 0, amount: 100, dueDate: future }
    ];
    expect(normalizeContractStatus({ installments })).toBe('ATIVO');
  });
});

// ── parseDate ─────────────────────────────────────────────────────────────────
describe('parseDate', () => {
  it('retorna null para string vazia ou nula', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });

  it('cria data como meia-noite UTC', () => {
    const d = parseDate('2024-03-15');
    expect(d.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('ignora a parte de hora quando presente', () => {
    const d = parseDate('2024-03-15T15:30:00');
    expect(d.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });
});

// ── toCsv ─────────────────────────────────────────────────────────────────────
describe('toCsv', () => {
  it('retorna string vazia para array vazio', () => {
    expect(toCsv([])).toBe('');
  });

  it('gera cabeçalho e linha de dados', () => {
    const rows = [{ nome: 'João', valor: 100 }];
    const csv = toCsv(rows);
    expect(csv).toContain('nome,valor');
    expect(csv).toContain('"João","100"');
  });

  it('escapa aspas duplas dentro de células', () => {
    const rows = [{ descricao: 'diz "olá"' }];
    expect(toCsv(rows)).toContain('"diz ""olá"""');
  });

  it('trata valores nulos como string vazia', () => {
    const rows = [{ a: null, b: undefined, c: 0 }];
    expect(toCsv(rows)).toContain('"","","0"');
  });
});

// ── moneyLike ─────────────────────────────────────────────────────────────────
describe('moneyLike', () => {
  it('formata com 2 casas decimais', () => {
    expect(moneyLike(100)).toBe('100.00');
    expect(moneyLike(1.5)).toBe('1.50');
  });

  it('trata null/undefined como zero', () => {
    expect(moneyLike(null)).toBe('0.00');
    expect(moneyLike(undefined)).toBe('0.00');
  });
});

// ── safeErrorMessage ──────────────────────────────────────────────────────────
describe('safeErrorMessage', () => {
  const OLD_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('retorna mensagem do ZodError', () => {
    const err = { name: 'ZodError', message: 'CPF inválido.' };
    expect(safeErrorMessage(err, 'fallback')).toBe('CPF inválido.');
  });

  it('retorna mensagem amigável para P2002 (unique)', () => {
    const err = { code: 'P2002', meta: { target: ['cpf'] } };
    expect(safeErrorMessage(err, 'fallback')).toContain('cpf');
  });

  it('retorna fallback para P2025 (not found)', () => {
    const err = { code: 'P2025' };
    expect(safeErrorMessage(err, 'Não encontrado.')).toBe('Não encontrado.');
  });

  it('expõe mensagem original fora de produção', () => {
    process.env.NODE_ENV = 'test';
    const err = new Error('erro interno qualquer');
    expect(safeErrorMessage(err, 'fallback')).toBe('erro interno qualquer');
  });

  it('retorna fallback em produção para erros genéricos', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('detalhes internos');
    expect(safeErrorMessage(err, 'Erro interno.')).toBe('Erro interno.');
  });
});

// ── getErrorStatus ────────────────────────────────────────────────────────────
describe('getErrorStatus', () => {
  it('retorna 422 para ZodError', () => {
    expect(getErrorStatus({ name: 'ZodError' })).toBe(422);
  });

  it('retorna 409 para P2002 (unique constraint)', () => {
    expect(getErrorStatus({ code: 'P2002' })).toBe(409);
  });

  it('retorna 404 para P2025 (record not found)', () => {
    expect(getErrorStatus({ code: 'P2025' })).toBe(404);
  });

  it('retorna 409 para P2003 (foreign key)', () => {
    expect(getErrorStatus({ code: 'P2003' })).toBe(409);
  });

  it('retorna 500 para erros genéricos', () => {
    expect(getErrorStatus(new Error('ops'))).toBe(500);
    expect(getErrorStatus(null)).toBe(500);
    expect(getErrorStatus({})).toBe(500);
  });
});
