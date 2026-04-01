'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, Pencil, Trash2, Eye, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { Contract, ContractFormData, ContractStatus, Customer } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  customerId: z.string().min(1, 'Cliente obrigatório'),
  product: z.string().min(1, 'Produto obrigatório'),
  quantity: z.coerce.number().min(1).optional(),
  financedAmount: z.coerce.number().min(0.01, 'Valor obrigatório'),
  installmentCount: z.coerce.number().min(1, 'Parcelas obrigatório'),
  contractStartDate: z.string().min(1, 'Data obrigatória').nullable(),
  interestRate: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.enum(['ATIVO', 'QUITADO', 'ATRASADO', 'RENEGOCIADO']),
  promisedPaymentDate: z.string().optional().nullable(),
  promisedPaymentValue: z.coerce.number().optional().nullable(),
  collectionNote: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const statusColors: Record<ContractStatus, string> = {
  ATIVO: 'bg-blue-100 text-blue-800',
  QUITADO: 'bg-green-100 text-green-800',
  ATRASADO: 'bg-red-100 text-red-800',
  RENEGOCIADO: 'bg-purple-100 text-purple-800',
};

const statusLabels: Record<ContractStatus, string> = {
  ATIVO: 'Ativo',
  QUITADO: 'Quitado',
  ATRASADO: 'Atrasado',
  RENEGOCIADO: 'Renegociado',
};

const installmentStatusColors: Record<string, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800',
  PAGA: 'bg-green-100 text-green-800',
  ATRASADA: 'bg-red-100 text-red-800',
  PARCIAL: 'bg-blue-100 text-blue-800',
};

const renegotiateSchema = z.object({
  installmentCount: z.coerce.number().int().min(1, 'Obrigatório'),
  contractStartDate: z.string().min(1, 'Data obrigatória'),
  interestRate: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type RenegotiateFormData = z.infer<typeof renegotiateSchema>;

function RenegotiateModal({
  contract,
  open,
  onClose,
  onConfirm,
}: {
  contract: Contract;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: RenegotiateFormData) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RenegotiateFormData>({
    resolver: zodResolver(renegotiateSchema),
    defaultValues: { installmentCount: contract.installmentCount, interestRate: 0, contractStartDate: today },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renegociar contrato</DialogTitle>
        </DialogHeader>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 mb-2">
          <p className="font-semibold">{contract.customer?.name} — {contract.product}</p>
          <p>Saldo devedor: <span className="font-mono font-bold">{contract.pendingAmount != null ? `R$ ${Number(contract.pendingAmount).toFixed(2).replace('.', ',')}` : '—'}</span></p>
          <p className="mt-1 text-purple-600">O contrato atual será marcado como Renegociado e um novo contrato será criado com o saldo pendente.</p>
        </div>
        <form onSubmit={handleSubmit(onConfirm)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nº de parcelas *</Label>
              <Input type="number" min={1} {...register('installmentCount')} />
              {errors.installmentCount && <p className="text-xs text-destructive">{errors.installmentCount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Juros (%)</Label>
              <Input type="number" step="0.01" {...register('interestRate')} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Data de início *</Label>
              <Input type="date" {...register('contractStartDate')} />
              {errors.contractStartDate && <p className="text-xs text-destructive">{errors.contractStartDate.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('notes')} rows={2} placeholder="Motivo da renegociação..." />
            </div>
          </div>
          <Button type="submit" className="w-full bg-purple-500" disabled={isSubmitting}>
            {isSubmitting ? 'Renegociando...' : 'Confirmar renegociação'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractsPage() {
  const { isAdmin } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [installmentsModal, setInstallmentsModal] = useState<{ open: boolean; contract: Contract | null }>({
    open: false,
    contract: null,
  });
  const [renegotiateModal, setRenegotiateModal] = useState<{ open: boolean; contract: Contract | null }>({
    open: false,
    contract: null,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ATIVO', quantity: 1, installmentCount: 1 },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [contractsRes, customersRes] = await Promise.all([
        api.get<Contract[]>('/contracts'),
        api.get<Customer[]>('/customers'),
      ]);
      setContracts(contractsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch {
      toast.error('Erro ao carregar contratos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        c.customer?.name?.toLowerCase().includes(q) ||
        c.customer?.cpf?.includes(q) ||
        c.product?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contracts, search, statusFilter]);

  function openDrawer(item?: Contract) {
    setEditing(item || null);
    if (item) {
      reset({
        ...item,
        contractStartDate: item.contractStartDate?.slice(0, 10) || null,
        promisedPaymentDate: item.promisedPaymentDate?.slice(0, 10) || null,
        financedAmount: item.financedAmount,
        installmentCount: item.installmentCount,
        interestRate: item.interestRate ?? 0,
        promisedPaymentValue: item.promisedPaymentValue ?? null,
      });
    } else {
      reset({ status: 'ATIVO', quantity: 1, installmentCount: 1, interestRate: 0 });
    }
    setDrawerOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload: ContractFormData = {
        ...data,
        contractStartDate: data.contractStartDate || null,
        promisedPaymentDate: data.promisedPaymentDate || null,
        promisedPaymentValue: data.promisedPaymentValue || null,
      };
      if (editing) {
        await api.put(`/contracts/${editing.id}`, payload);
        toast.success('Contrato atualizado.');
      } else {
        await api.post('/contracts', payload);
        toast.success('Contrato criado.');
      }
      setDrawerOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar contrato.'));
    }
  };

  const deleteContract = async (id: string) => {
    try {
      await api.delete(`/contracts/${id}`);
      toast.success('Contrato removido.');
      load();
    } catch {
      toast.error('Erro ao remover contrato.');
    }
  };

  const viewInstallments = (contract: Contract) => {
    setInstallmentsModal({ open: true, contract });
  };

  const renegotiateContract = async (id: string, data: { installmentCount: number; contractStartDate: string; interestRate: number; notes?: string }) => {
    try {
      await api.post(`/contracts/${id}/renegotiate`, data);
      toast.success('Contrato renegociado com sucesso.');
      setRenegotiateModal({ open: false, contract: null });
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao renegociar contrato.'));
    }
  };

  const currentStatus = watch('status');
  const currentCustomerId = watch('customerId');

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Contratos"
        subtitle="Gerencie os contratos de empréstimo"
        extra={
          isAdmin && (
            <Button size="sm" onClick={() => openDrawer()} className="bg-blue-600">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo contrato
            </Button>
          )
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
        <Select value={statusFilter} onValueChange={(v) => v !== null && setStatusFilter(v)}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="ATRASADO">Atrasado</SelectItem>
            <SelectItem value="QUITADO">Quitado</SelectItem>
            <SelectItem value="RENEGOCIADO">Renegociado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Produto</TableHead>
                <TableHead className="hidden md:table-cell text-right">Valor</TableHead>
                <TableHead className="hidden md:table-cell text-center">Parcelas</TableHead>
                <TableHead className="hidden lg:table-cell">Início</TableHead>
                <TableHead className="hidden md:table-cell text-center">Atrasadas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum contrato encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{c.customer?.name}</p>
                        <p className="text-xs text-muted-foreground">{c.product}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <span className="font-mono text-sm font-semibold">{money(c.financedAmount)}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center text-sm text-muted-foreground">
                      {c.installmentCount}x
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {dateBR(c.contractStartDate)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                      {(c.overdueInstallments ?? 0) > 0 ? (
                        <span className="text-xs font-bold text-red-600">{c.overdueInstallments}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[c.status]}`}>
                        {statusLabels[c.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewInstallments(c)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <>
                            {(c.status === 'ATIVO' || c.status === 'ATRASADO') && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-purple-600 hover:text-purple-700"
                                title="Renegociar"
                                onClick={() => setRenegotiateModal({ open: true, contract: c })}
                              >
                                <GitBranch className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover contrato?</AlertDialogTitle>
                                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteContract(c.id)}>Remover</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-muted-foreground">{filtered.length} contrato(s)</p>
          </div>
        </CardContent>
      </Card>

      {/* Modal de parcelas */}
      <Dialog open={installmentsModal.open} onOpenChange={(v) => setInstallmentsModal({ open: v, contract: null })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Parcelas — {installmentsModal.contract?.customer?.name} — {installmentsModal.contract?.product}
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(installmentsModal.contract?.installments || []).map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell className="text-sm text-muted-foreground">{inst.installmentNumber}</TableCell>
                  <TableCell className="text-sm">{dateBR(inst.dueDate)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{money(inst.amount)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{inst.paidAmount ? money(inst.paidAmount) : '—'}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${installmentStatusColors[inst.status] || ''}`}>
                      {inst.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Modal renegociação */}
      {renegotiateModal.contract && (
        <RenegotiateModal
          contract={renegotiateModal.contract}
          open={renegotiateModal.open}
          onClose={() => setRenegotiateModal({ open: false, contract: null })}
          onConfirm={(data) => renegotiateContract(renegotiateModal.contract!.id, data)}
        />
      )}

      {/* Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Editar contrato' : 'Novo contrato'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Cliente *</Label>
                <Select value={currentCustomerId} onValueChange={(v) => v !== null && setValue('customerId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.cpf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Produto / Descrição *</Label>
                <Input {...register('product')} placeholder="Ex: Cesta básica, empréstimo..." />
                {errors.product && <p className="text-xs text-destructive">{errors.product.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Qtd. produto</Label>
                <Input type="number" min={1} {...register('quantity')} />
              </div>

              <div className="space-y-1.5">
                <Label>Valor financiado (R$) *</Label>
                <Input type="number" step="0.01" {...register('financedAmount')} />
                {errors.financedAmount && <p className="text-xs text-destructive">{errors.financedAmount.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Nº parcelas *</Label>
                <Input type="number" min={1} {...register('installmentCount')} />
                {errors.installmentCount && <p className="text-xs text-destructive">{errors.installmentCount.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Juros (%)</Label>
                <Input type="number" step="0.01" {...register('interestRate')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Data de início *</Label>
                <Input type="date" {...register('contractStartDate')} />
                {errors.contractStartDate && <p className="text-xs text-destructive">{errors.contractStartDate.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={currentStatus} onValueChange={(v) => v !== null && setValue('status', v as ContractStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="ATRASADO">Atrasado</SelectItem>
                    <SelectItem value="QUITADO">Quitado</SelectItem>
                    <SelectItem value="RENEGOCIADO">Renegociado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Data promessa</Label>
                <Input type="date" {...register('promisedPaymentDate')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Valor prometido (R$)</Label>
                <Input type="number" step="0.01" {...register('promisedPaymentValue')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Nota de cobrança</Label>
                <Textarea {...register('collectionNote')} rows={2} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Observações</Label>
                <Textarea {...register('notes')} rows={3} />
              </div>
            </div>

            <Button type="submit" className="w-full bg-blue-600" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : editing ? 'Atualizar' : 'Criar contrato'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
