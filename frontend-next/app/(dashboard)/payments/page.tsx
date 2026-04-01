'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, Pencil, Trash2, FileDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { Payment, PaymentFormData, PaymentMethod, Contract, User } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  contractId: z.string().min(1, 'Contrato obrigatório'),
  installmentId: z.string().optional().nullable(),
  collectorId: z.string().min(1, 'Cobrador obrigatório'),
  amount: z.coerce.number().min(0.01, 'Valor obrigatório'),
  paymentDate: z.string().min(1, 'Data obrigatória'),
  paymentMethod: z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'BOLETO', 'TED']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const today = new Date().toISOString().slice(0, 10);

export default function PaymentsPage() {
  const { isAdmin, isCollector, user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'PIX', paymentDate: today },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const calls: Promise<unknown>[] = [
        api.get<Payment[]>('/payments'),
        api.get<Contract[]>('/contracts'),
      ];
      if (isAdmin) calls.push(api.get<User[]>('/collectors'));
      const results = await Promise.all(calls);
      setPayments((results[0] as { data: Payment[] }).data || []);
      setContracts((results[1] as { data: Contract[] }).data || []);
      if (isAdmin) setCollectors((results[2] as { data: User[] }).data || []);
    } catch {
      toast.error('Erro ao carregar pagamentos.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.contract?.customer?.name?.toLowerCase().includes(q) ||
        p.contract?.customer?.cpf?.includes(q) ||
        p.contract?.product?.toLowerCase().includes(q);
      let matchDate = true;
      if (startDate && endDate) {
        const pd = p.paymentDate?.slice(0, 10);
        matchDate = pd >= startDate && pd <= endDate;
      }
      return matchSearch && matchDate;
    });
  }, [payments, search, startDate, endDate]);

  function openModal(item?: Payment) {
    setEditing(item || null);
    if (item) {
      reset({
        contractId: item.contractId,
        installmentId: item.installmentId || null,
        collectorId: item.collectorId || item.collector?.id || '',
        amount: item.amount,
        paymentDate: item.paymentDate?.slice(0, 10) || today,
        paymentMethod: item.paymentMethod as PaymentMethod,
        notes: item.notes || '',
      });
    } else {
      reset({
        paymentMethod: 'PIX',
        paymentDate: today,
        amount: 0,
        collectorId: isCollector ? user?.id || '' : '',
      });
    }
    setModalOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload: PaymentFormData = {
        ...data,
        installmentId: data.installmentId || null,
      };
      if (editing) {
        await api.put(`/payments/${editing.id}`, payload);
        toast.success('Pagamento atualizado.');
      } else {
        await api.post('/payments', payload);
        toast.success('Pagamento registrado.');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar pagamento.'));
    }
  };

  const deletePayment = async (id: string) => {
    try {
      await api.delete(`/payments/${id}`);
      toast.success('Pagamento removido.');
      load();
    } catch {
      toast.error('Erro ao remover pagamento.');
    }
  };

  const downloadReceipt = async (paymentId: string) => {
    try {
      const { data } = await api.get(`/payments/${paymentId}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprovante-${paymentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar comprovante.');
    }
  };

  const downloadCsv = async () => {
    try {
      const { data } = await api.get('/reports/payments.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio-pagamentos.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar relatório.');
    }
  };

  const currentContractId = watch('contractId');
  const currentCollectorId = watch('collectorId');
  const currentMethod = watch('paymentMethod');

  // Parcelas do contrato selecionado
  const selectedContractInstallments = useMemo(() => {
    if (!currentContractId) return [];
    const c = contracts.find((ct) => ct.id === currentContractId);
    return c?.installments || [];
  }, [contracts, currentContractId]);

  const total = useMemo(
    () => filtered.reduce((acc, p) => acc + Number(p.amount || 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Pagamentos"
        subtitle="Registro de recebimentos"
        extra={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                CSV
              </Button>
            )}
            <Button size="sm" onClick={() => openModal()} className="bg-blue-600">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Registrar
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou produto..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input type="date" className="w-36 h-9" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input type="date" className="w-36 h-9" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Contrato</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="hidden md:table-cell">Método</TableHead>
                <TableHead className="hidden lg:table-cell">Cobrador</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum pagamento encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{p.contract?.customer?.name}</p>
                        <p className="text-xs text-muted-foreground">{p.contract?.product}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {dateBR(p.paymentDate)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded-full">
                        {p.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {p.collector?.name || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-semibold text-sm text-green-500">
                        {money(p.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Comprovante PDF" onClick={() => downloadReceipt(p.id)}>
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModal(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover pagamento?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePayment(p.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{filtered.length} pagamento(s)</p>
            <p className="text-sm font-bold font-mono text-green-500">
              Total: {money(total)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar pagamento' : 'Registrar pagamento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Contrato *</Label>
                <Select value={currentContractId} onValueChange={(v) => v !== null && setValue('contractId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o contrato..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.customer?.name} — {c.product}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.contractId && <p className="text-xs text-destructive">{errors.contractId.message}</p>}
              </div>

              {selectedContractInstallments.length > 0 && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Parcela (opcional)</Label>
                  <Select
                    value={watch('installmentId') || ''}
                    onValueChange={(v) => setValue('installmentId', v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem vínculo com parcela específica" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedContractInstallments
                        .filter((i) => i.status !== 'PAGA')
                        .map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            Parc. {i.installmentNumber} — venc. {dateBR(i.dueDate)} — {money(i.amount)} ({i.status})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isAdmin && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Cobrador *</Label>
                  <Select value={currentCollectorId} onValueChange={(v) => v !== null && setValue('collectorId', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cobrador..." />
                    </SelectTrigger>
                    <SelectContent>
                      {collectors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.collectorId && <p className="text-xs text-destructive">{errors.collectorId.message}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" {...register('amount')} />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" {...register('paymentDate')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Método</Label>
                <Select value={currentMethod} onValueChange={(v) => v !== null && setValue('paymentMethod', v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                    <SelectItem value="CARTAO">Cartão</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="TED">TED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Observações</Label>
                <Textarea {...register('notes')} rows={2} />
              </div>
            </div>

            <Button type="submit" className="w-full bg-blue-600" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : editing ? 'Atualizar' : 'Registrar pagamento'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
