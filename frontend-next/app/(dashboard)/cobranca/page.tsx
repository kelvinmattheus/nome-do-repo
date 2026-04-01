'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { RefreshCw, Phone, MapPin, AlertCircle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { CollectorContractView, Installment, PaymentMethod } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const paymentSchema = z.object({
  contractId: z.string().min(1),
  installmentId: z.string().optional().nullable(),
  collectorId: z.string().min(1),
  amount: z.coerce.number().min(0.01, 'Valor obrigatório'),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'BOLETO', 'TED']),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const today = new Date().toISOString().slice(0, 10);

const installmentStatusColors: Record<string, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800',
  PAGA: 'bg-green-100 text-green-800',
  ATRASADA: 'bg-red-100 text-red-800',
  PARCIAL: 'bg-blue-100 text-blue-800',
};

export default function CobrancaPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<CollectorContractView[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    contract: CollectorContractView | null;
    installment: Installment | null;
  }>({ open: false, contract: null, installment: null });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentMethod: 'PIX', paymentDate: today },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<CollectorContractView[]>('/collector/dashboard');
      setContracts(data || []);
    } catch {
      toast.error('Erro ao carregar dados de cobrança.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = contracts.filter((c) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      c.customer.name.toLowerCase().includes(q) ||
      c.customer.cpf.includes(q) ||
      c.product.toLowerCase().includes(q)
    );
  });

  function openPayment(contract: CollectorContractView, installment?: Installment) {
    reset({
      contractId: contract.id,
      installmentId: installment?.id || null,
      collectorId: user?.id || '',
      amount: installment?.amount || contract.pendingAmount || 0,
      paymentDate: today,
      paymentMethod: 'PIX',
    });
    setPaymentModal({ open: true, contract, installment: installment || null });
  }

  const onSubmit = async (data: PaymentFormData) => {
    try {
      await api.post('/payments', {
        ...data,
        installmentId: data.installmentId || null,
      });
      toast.success('Pagamento registrado!');
      setPaymentModal({ open: false, contract: null, installment: null });
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao registrar pagamento.'));
    }
  };

  const currentMethod = watch('paymentMethod');

  const overdueCount = filtered.filter((c) => (c.overdueInstallments || 0) > 0).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Cobrança"
        subtitle={`Olá, ${user?.name}! Sua carteira de cobranças`}
        extra={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Contratos</p>
            <p className="text-xl font-bold font-mono mt-0.5">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Em atraso</p>
            <p className="text-xl font-bold font-mono mt-0.5 text-red-500">
              {overdueCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Saldo total</p>
            <p className="text-lg font-bold font-mono mt-0.5 text-blue-600">
              {money(filtered.reduce((acc, c) => acc + (c.pendingAmount || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <Input
        placeholder="Buscar por cliente, CPF ou produto..."
        className="h-9"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Cards de contratos */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {loading ? 'Carregando...' : 'Nenhum contrato atribuído.'}
          </div>
        ) : (
          filtered.map((contract) => {
            const isOverdue = (contract.overdueInstallments || 0) > 0;
            const pendingInstallments = contract.installments?.filter(
              (i) => i.status !== 'PAGA'
            ) || [];

            return (
              <Card
                key={contract.id}
                className={`border-0 shadow-sm ${isOverdue ? 'border-l-4 border-l-red-500' : ''}`}
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">{contract.customer.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{contract.product}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isOverdue && (
                        <span className="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {contract.overdueInstallments} atrasada(s)
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        contract.status === 'QUITADO' ? 'bg-green-100 text-green-800' :
                        contract.status === 'ATRASADO' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {contract.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 space-y-3">
                  {/* Info do cliente */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {(contract.customer.phone1 || contract.customer.phone2) && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contract.customer.phone1}{contract.customer.phone2 ? ` / ${contract.customer.phone2}` : ''}
                      </span>
                    )}
                    {contract.customer.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {contract.customer.street && `${contract.customer.street}, ${contract.customer.number} — `}
                        {contract.customer.neighborhood && `${contract.customer.neighborhood}, `}
                        {contract.customer.city}
                      </span>
                    )}
                  </div>

                  {/* Saldo */}
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo devedor</p>
                      <p className="text-lg font-bold font-mono text-red-500">
                        {money(contract.pendingAmount)}
                      </p>
                    </div>
                    {contract.promisedPaymentDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Promessa</p>
                        <p className="text-sm font-medium">{dateBR(contract.promisedPaymentDate)}</p>
                        {contract.promisedPaymentValue && (
                          <p className="text-xs text-muted-foreground font-mono">{money(contract.promisedPaymentValue)}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Nota de cobrança */}
                  {contract.collectionNote && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      {contract.collectionNote}
                    </div>
                  )}

                  {/* Parcelas pendentes */}
                  {pendingInstallments.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Parcelas pendentes ({pendingInstallments.length})
                      </p>
                      <div className="space-y-1.5">
                        {pendingInstallments.slice(0, 5).map((inst) => (
                          <div
                            key={inst.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${installmentStatusColors[inst.status] || ''}`}>
                                {inst.status}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Parc. {inst.installmentNumber} — venc. {dateBR(inst.dueDate)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold">{money(inst.amount)}</span>
                              {inst.status !== 'PAGA' && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-blue-600"
                                  onClick={() => openPayment(contract, inst)}
                                >
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  Pagar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {pendingInstallments.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center">
                            + {pendingInstallments.length - 5} parcela(s)
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full bg-blue-600"
                    onClick={() => openPayment(contract)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Registrar pagamento
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal pagamento */}
      <Dialog open={paymentModal.open} onOpenChange={(v) => setPaymentModal({ open: v, contract: null, installment: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Registrar pagamento
              {paymentModal.contract && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  — {paymentModal.contract.customer.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {paymentModal.installment && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              Parcela {paymentModal.installment.installmentNumber} — venc. {dateBR(paymentModal.installment.dueDate)} — {money(paymentModal.installment.amount)}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" {...register('amount')} />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" {...register('paymentDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={currentMethod} onValueChange={(v) => setValue('paymentMethod', v as PaymentMethod)}>
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
              {isSubmitting ? 'Registrando...' : 'Confirmar pagamento'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
