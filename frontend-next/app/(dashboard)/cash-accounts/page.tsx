'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { CashAccountsResponse, User } from '@/types';
import dayjs from 'dayjs';

export default function CashAccountsPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<CashAccountsResponse | null>(null);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());
  const [collectorId, setCollectorId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [accountsRes, colRes] = await Promise.all([
        api.get<CashAccountsResponse>('/cash-accounts/monthly', { params: { month, year, collectorId } }),
        api.get<User[]>('/collectors'),
      ]);
      setData(accountsRes.data);
      setCollectors(colRes.data || []);
    } catch {
      toast.error('Erro ao carregar prestação de contas.');
    } finally {
      setLoading(false);
    }
  }, [month, year, collectorId]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async (cId: string, cName: string) => {
    try {
      const mes = String(month).padStart(2, '0');
      const { data: blob } = await api.get('/cash-accounts/monthly/receipt/pdf', {
        params: { month, year, collectorId: cId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `prestacao-${cName.replace(/\s+/g, '-')}-${mes}-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar relatório PDF.');
    }
  };

  const downloadExcel = async (cId: string, cName: string) => {
    try {
      const mes = String(month).padStart(2, '0');
      const { data: blob } = await api.get('/cash-accounts/monthly/receipt/excel', {
        params: { month, year, collectorId: cId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `prestacao-${cName.replace(/\s+/g, '-')}-${mes}-${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar planilha Excel.');
    }
  };

  const months = [
    { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' }, { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' }, { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' },
  ];

  const currentYear = dayjs().year();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Prestação de contas"
        subtitle="Relatório mensal de recebimentos por cobrador"
      />

      <div className="flex gap-2 flex-wrap">
        <Select value={String(month)} onValueChange={(v) => v !== null && setMonth(Number(v))}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => v !== null && setYear(Number(v))}>
          <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={collectorId || 'all'} onValueChange={(v) => v !== null && setCollectorId(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Todos os cobradores" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cobradores</SelectItem>
            {collectors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Total geral */}
      {data && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">{data.accounts?.length || 0} cobrador(es)</p>
          <p className="text-base font-bold font-mono text-green-500">
            Total: {money(data.total)}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {(data?.accounts || []).map((account) => (
          <Card key={account.collectorId} className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">{account.collectorName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {account.payments} pagamento(s) — Total:{' '}
                    <span className="font-mono font-bold text-green-500">
                      {money(account.received)}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => downloadPdf(account.collectorId, account.collectorName)}
                  >
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                    PDF
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => downloadExcel(account.collectorId, account.collectorName)}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Contrato</TableHead>
                    <TableHead className="hidden md:table-cell">Método</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(account.receipts || []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm text-muted-foreground">{dateBR(p.paymentDate)}</TableCell>
                      <TableCell className="text-sm font-medium">{p.contract?.customer?.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.contract?.product}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">{p.paymentMethod}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-sm text-green-500">
                        {money(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
        {(!data?.accounts || data.accounts.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            {loading ? 'Carregando...' : 'Nenhum dado encontrado para o período selecionado.'}
          </div>
        )}
      </div>
    </div>
  );
}
