'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money } from '@/lib/formatters';
import type { DistributionCollector, Contract } from '@/types';
import { getErrorMessage } from '@/lib/utils';

export default function AssignmentsPage() {
  const { isAdmin } = useAuth();
  const [collectors, setCollectors] = useState<DistributionCollector[]>([]);
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState<DistributionCollector | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [colRes, contRes] = await Promise.all([
        api.get<DistributionCollector[]>('/distribution/collectors'),
        api.get<Contract[]>('/distribution/available-contracts'),
      ]);
      setCollectors(colRes.data || []);
      setAvailableContracts(contRes.data || []);
    } catch {
      toast.error('Erro ao carregar distribuição.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal(collector: DistributionCollector) {
    setSelectedCollector(collector);
    setSelectedIds([]);
    setModalOpen(true);
  }

  const assignContracts = async () => {
    if (!selectedCollector || selectedIds.length === 0) return;
    try {
      await api.post('/distribution/bulk', {
        collectorId: selectedCollector.id,
        contractIds: selectedIds,
      });
      toast.success(`${selectedIds.length} contrato(s) distribuído(s).`);
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao distribuir contratos.'));
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    try {
      await api.delete(`/assignments/${assignmentId}`);
      toast.success('Distribuição removida.');
      load();
    } catch {
      toast.error('Erro ao remover distribuição.');
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Distribuição"
        subtitle="Atribua contratos em aberto a cobradores"
        extra={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        }
      />

      {collectors.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          Nenhum cobrador ativo. Cadastre cobradores na aba Usuários.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {collectors.map((collector) => (
            <Card key={collector.id} className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{collector.name}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => openModal(collector)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Distribuir
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{collector.email}</p>
                <p className="text-xs text-muted-foreground">
                  {collector.assignedCount} cliente(s) atribuído(s)
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {collector.assignedCustomers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Nenhum cliente atribuído.</p>
                ) : (
                  <div className="space-y-2">
                    {collector.assignedCustomers.map((c) => (
                      <div
                        key={c.assignmentId}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div>
                          <p className="text-xs font-medium">{c.customerName}</p>
                          <p className="text-xs text-muted-foreground">{c.product}</p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" />}>
                            <Trash2 className="h-3 w-3" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover distribuição?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeAssignment(c.assignmentId)}>
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal nova distribuição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Distribuir contratos — {selectedCollector?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {availableContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum contrato disponível para distribuição.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {availableContracts.length} contrato(s) disponível(is) — {selectedIds.length} selecionado(s)
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {availableContracts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleId(c.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(c.id)}
                        onCheckedChange={() => toggleId(c.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{c.customer?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.product} — {money(c.financedAmount)} — {c.installmentCount}x
                        </p>
                      </div>
                      {(c.overdueInstallments ?? 0) > 0 && (
                        <span className="text-xs text-red-600 font-bold">
                          {c.overdueInstallments} atras.
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full bg-blue-600"
                  disabled={selectedIds.length === 0}
                  onClick={assignContracts}
                >
                  Distribuir {selectedIds.length > 0 ? `${selectedIds.length} contrato(s)` : ''}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
