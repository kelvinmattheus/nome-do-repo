'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CheckCircle2, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { SpcRecord, SpcSummary, Customer, Contract } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  customerId: z.string().min(1, 'Cliente obrigatório'),
  contractId: z.string().optional().nullable(),
  includeDate: z.string().optional().nullable(),
  debtAmount: z.coerce.number().min(0.01, 'Valor obrigatório'),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const baixarSchema = z.object({
  removedReason: z.string().min(1, 'Motivo obrigatório'),
  notes: z.string().optional(),
});

const acordoSchema = z.object({
  agreedAmount: z.coerce.number().min(0.01),
  dueDate: z.string().min(1),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type BaixarData = z.infer<typeof baixarSchema>;
type AcordoData = z.infer<typeof acordoSchema>;

export default function SpcPage() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<SpcRecord[]>([]);
  const [summary, setSummary] = useState<SpcSummary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SpcRecord | null>(null);
  const [baixarModal, setBaixarModal] = useState<{ open: boolean; item: SpcRecord | null }>({ open: false, item: null });
  const [acordoModal, setAcordoModal] = useState<{ open: boolean; item: SpcRecord | null }>({ open: false, item: null });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const baixarForm = useForm<BaixarData>({ resolver: zodResolver(baixarSchema) });
  const acordoForm = useForm<AcordoData>({ resolver: zodResolver(acordoSchema) });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [recRes, sumRes, custRes, contRes] = await Promise.all([
        api.get<SpcRecord[]>('/spc'),
        api.get<SpcSummary>('/spc/summary'),
        api.get<Customer[]>('/customers'),
        api.get<Contract[]>('/contracts'),
      ]);
      setRecords(recRes.data || []);
      setSummary(sumRes.data);
      setCustomers(custRes.data || []);
      setContracts(contRes.data || []);
    } catch {
      toast.error('Erro ao carregar SPC.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDrawer(item?: SpcRecord) {
    setEditing(item || null);
    if (item) {
      reset({ debtAmount: item.debtAmount, reason: item.reason, notes: item.notes });
    } else {
      reset({ debtAmount: 0 });
    }
    setDrawerOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      if (editing) {
        await api.put(`/spc/${editing.id}`, data);
        toast.success('Registro atualizado.');
      } else {
        await api.post('/spc', { ...data, contractId: data.contractId || null, includeDate: data.includeDate || null });
        toast.success('Cliente incluído no SPC.');
      }
      setDrawerOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar.'));
    }
  };

  const onBaixar = async (data: BaixarData) => {
    if (!baixarModal.item) return;
    try {
      await api.put(`/spc/${baixarModal.item.id}/baixar`, data);
      toast.success('Registro baixado com sucesso.');
      setBaixarModal({ open: false, item: null });
      baixarForm.reset();
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao baixar.'));
    }
  };

  const onAcordo = async (data: AcordoData) => {
    if (!acordoModal.item) return;
    try {
      await api.post(`/spc/${acordoModal.item.id}/acordo`, data);
      toast.success('Acordo registrado.');
      setAcordoModal({ open: false, item: null });
      acordoForm.reset();
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao registrar acordo.'));
    }
  };

  const deleteRecord = async (id: string) => {
    try {
      await api.delete(`/spc/${id}`);
      toast.success('Registro excluído.');
      load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  const currentCustomerId = watch('customerId');

  const customerContracts = useMemo(() => {
    if (!currentCustomerId) return [];
    return contracts.filter((c) => c.customerId === currentCustomerId && (c.overdueInstallments ?? 0) > 0);
  }, [contracts, currentCustomerId]);

  const overdueCustomers = useMemo(() => {
    return customers.filter((cu) => contracts.some((c) => c.customerId === cu.id && (c.overdueInstallments ?? 0) > 0));
  }, [customers, contracts]);

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="SPC"
        subtitle="Registros no serviço de proteção ao crédito"
        extra={
          <Button size="sm" onClick={() => openDrawer()} className="bg-red-500">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Incluir no SPC
          </Button>
        }
      />

      {/* Resumo */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Registros ativos</p>
              <p className="text-2xl font-bold font-mono mt-1 text-red-500">{summary.totalActive}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total em dívida</p>
              <p className="text-2xl font-bold font-mono mt-1 text-red-500">{money(summary.totalDebt)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Baixados</p>
              <p className="text-2xl font-bold font-mono mt-1 text-green-500">{summary.totalBaixados}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Inclusão</TableHead>
                <TableHead className="text-right">Dívida</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum registro encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.customer?.name}</p>
                        <p className="text-xs text-muted-foreground">{r.reason || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {dateBR(r.includeDate || r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-sm text-red-500">
                      {money(r.debtAmount)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.status === 'ATIVO' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {r.status === 'ATIVO' ? 'Ativo' : 'Baixado'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {r.status === 'ATIVO' && (
                          <>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700"
                              onClick={() => setBaixarModal({ open: true, item: r })}
                              title="Baixar"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700"
                              onClick={() => setAcordoModal({ open: true, item: r })}
                              title="Acordo"
                            >
                              <Handshake className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteRecord(r.id)}>Excluir</AlertDialogAction>
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
        </CardContent>
      </Card>

      {/* Drawer incluir/editar */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Editar registro SPC' : 'Incluir no SPC'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            {!editing && (
              <>
                <div className="space-y-1.5">
                  <Label>Cliente (somente com parcelas atrasadas) *</Label>
                  <Select value={currentCustomerId} onValueChange={(v) => { if (v !== null) { setValue('customerId', v); setValue('contractId', null); } }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {overdueCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} — {c.cpf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Contrato vinculado</Label>
                  <Select onValueChange={(v) => setValue('contractId', (v as string) ?? null)} disabled={!currentCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar contrato..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerContracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.product} — {c.overdueInstallments} parc. atrasada(s)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de inclusão</Label>
                  <Input type="date" {...register('includeDate')} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Valor da dívida (R$) *</Label>
              <Input type="number" step="0.01" {...register('debtAmount')} />
              {errors.debtAmount && <p className="text-xs text-destructive">{errors.debtAmount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input {...register('reason')} placeholder="Ex: Parcelas em atraso desde 01/2025..." />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('notes')} rows={3} />
            </div>
            {!editing && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                ⚠ O registro no SPC tem validade de <strong>5 anos</strong> a partir da data de inclusão.
              </div>
            )}
            <Button type="submit" className="w-full bg-red-500" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : editing ? 'Atualizar' : 'Incluir no SPC'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Modal baixar */}
      <Dialog open={baixarModal.open} onOpenChange={(v) => { setBaixarModal({ open: v, item: null }); baixarForm.reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Baixar registro do SPC</DialogTitle>
          </DialogHeader>
          {baixarModal.item && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs mb-4">
              Cliente: <strong>{baixarModal.item.customer?.name}</strong> — Dívida: <strong className="text-red-600">{money(baixarModal.item.debtAmount)}</strong>
            </div>
          )}
          <form onSubmit={baixarForm.handleSubmit(onBaixar)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo da baixa *</Label>
              <Select onValueChange={(v) => baixarForm.setValue('removedReason', (v as string) ?? '')}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pagamento integral">Pagamento integral</SelectItem>
                  <SelectItem value="Acordo quitado">Acordo quitado</SelectItem>
                  <SelectItem value="Decisao judicial">Decisão judicial</SelectItem>
                  <SelectItem value="Erro de inclusao">Erro de inclusão</SelectItem>
                  <SelectItem value="Prescricao">Prescrição (5 anos)</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...baixarForm.register('notes')} rows={2} />
            </div>
            <Button type="submit" className="w-full bg-green-500" disabled={baixarForm.formState.isSubmitting}>
              Confirmar baixa
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal acordo */}
      <Dialog open={acordoModal.open} onOpenChange={(v) => { setAcordoModal({ open: v, item: null }); acordoForm.reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar acordo</DialogTitle>
          </DialogHeader>
          {acordoModal.item && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs mb-4">
              Cliente: <strong>{acordoModal.item.customer?.name}</strong> — Dívida: <strong>{money(acordoModal.item.debtAmount)}</strong>
            </div>
          )}
          <form onSubmit={acordoForm.handleSubmit(onAcordo)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Valor acordado (R$) *</Label>
              <Input type="number" step="0.01" {...acordoForm.register('agreedAmount')} />
            </div>
            <div className="space-y-1.5">
              <Label>Data de pagamento *</Label>
              <Input type="date" {...acordoForm.register('dueDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...acordoForm.register('notes')} rows={2} />
            </div>
            <Button type="submit" className="w-full bg-amber-500" disabled={acordoForm.formState.isSubmitting}>
              Registrar acordo
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
