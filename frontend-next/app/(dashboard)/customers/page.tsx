'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { dateBR, money } from '@/lib/formatters';
import type { Customer, CustomerFormData, CustomerStatus, CustomerFullResponse } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  cpf: z.string().min(11, 'CPF obrigatório'),
  name: z.string().min(2, 'Nome obrigatório'),
  zipCode: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  birthDate: z.string().optional().nullable(),
  phone1: z.string().optional(),
  phone2: z.string().optional(),
  monthlyIncome: z.coerce.number().optional(),
  residenceMonths: z.coerce.number().optional(),
  status: z.enum(['ATIVO', 'INADIMPLENTE', 'INATIVO']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const statusColors: Record<CustomerStatus, string> = {
  ATIVO: 'bg-green-100 text-green-800',
  INADIMPLENTE: 'bg-red-100 text-red-800',
  INATIVO: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<CustomerStatus, string> = {
  ATIVO: 'Ativo',
  INADIMPLENTE: 'Inadimplente',
  INATIVO: 'Inativo',
};

function ageFromDate(dateStr?: string): number {
  if (!dateStr) return 0;
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const contractStatusColors: Record<string, string> = {
  ATIVO: 'bg-blue-100 text-blue-800',
  QUITADO: 'bg-green-100 text-green-800',
  ATRASADO: 'bg-red-100 text-red-800',
  RENEGOCIADO: 'bg-purple-100 text-purple-800',
};

const timelineIcons: Record<string, string> = {
  CONTRATO: '📄',
  PAGAMENTO: '💳',
  DISTRIBUICAO: '🗂️',
};

export default function CustomersPage() {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<CustomerFullResponse | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ATIVO' },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<Customer[]>('/customers');
      setCustomers(data || []);
    } catch {
      toast.error('Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.cpf.includes(q);
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [customers, search, statusFilter]);

  function openDrawer(item?: Customer) {
    setEditing(item || null);
    if (item) {
      reset({
        ...item,
        birthDate: item.birthDate ? item.birthDate.slice(0, 10) : '',
        monthlyIncome: item.monthlyIncome ?? 0,
        residenceMonths: item.residenceMonths ?? 0,
      });
    } else {
      reset({ status: 'ATIVO', monthlyIncome: 0, residenceMonths: 0 });
    }
    setDrawerOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload: CustomerFormData = {
        ...data,
        birthDate: data.birthDate || null,
      };
      if (editing) {
        await api.put(`/customers/${editing.id}`, payload);
        toast.success('Cliente atualizado.');
      } else {
        await api.post('/customers', payload);
        toast.success('Cliente cadastrado.');
      }
      setDrawerOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar cliente.'));
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      await api.delete(`/customers/${id}`);
      toast.success('Cliente removido.');
      load();
    } catch {
      toast.error('Erro ao remover cliente.');
    }
  };

  const openProfile = async (customer: Customer) => {
    setProfileData(null);
    setProfileLoading(true);
    setProfileOpen(true);
    try {
      const { data } = await api.get<CustomerFullResponse>(`/customers/${customer.id}/full`);
      setProfileData(data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao carregar ficha do cliente.'));
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const currentStatus = watch('status');

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Clientes"
        subtitle="Gerencie o cadastro de clientes"
        extra={
          isAdmin && (
            <Button size="sm" onClick={() => openDrawer()} className="bg-blue-600">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo cliente
            </Button>
          )
        }
      />

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CPF..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v !== null && setStatusFilter(v)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="INADIMPLENTE">Inadimplente</SelectItem>
            <SelectItem value="INATIVO">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tabela */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / CPF</TableHead>
                <TableHead className="hidden md:table-cell">Cidade</TableHead>
                <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                <TableHead className="hidden lg:table-cell">Nascimento</TableHead>
                <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum cliente encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.cpf}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {c.city || '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {c.phone1 || '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {dateBR(c.birthDate)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[c.status]}`}>
                        {statusLabels[c.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver ficha" onClick={() => openProfile(c)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteCustomer(c.id)}>
                                    Remover
                                  </AlertDialogAction>
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
            <p className="text-xs text-muted-foreground">{filtered.length} cliente(s)</p>
          </div>
        </CardContent>
      </Card>

      {/* Ficha do Cliente */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha completa do cliente</DialogTitle>
          </DialogHeader>
          {profileLoading ? (
            <p className="py-10 text-center text-muted-foreground">Carregando ficha...</p>
          ) : profileData ? (
            <div className="space-y-6 mt-2">
              {/* Dados pessoais */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dados pessoais</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{profileData.customer.name}</span></div>
                  <div><span className="text-muted-foreground">CPF:</span> <span className="font-mono">{profileData.customer.cpf}</span></div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[profileData.customer.status]}`}>
                      {statusLabels[profileData.customer.status]}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">Nascimento:</span> {dateBR(profileData.customer.birthDate)} {profileData.customer.birthDate ? `(${ageFromDate(profileData.customer.birthDate)} anos)` : ''}</div>
                  <div><span className="text-muted-foreground">Telefone 1:</span> {profileData.customer.phone1 || '—'}</div>
                  <div><span className="text-muted-foreground">Telefone 2:</span> {profileData.customer.phone2 || '—'}</div>
                  <div><span className="text-muted-foreground">Cidade/UF:</span> {profileData.customer.city ? `${profileData.customer.city}/${profileData.customer.state}` : '—'}</div>
                  <div><span className="text-muted-foreground">Endereço:</span> {profileData.customer.street ? `${profileData.customer.street}, ${profileData.customer.number}` : '—'}</div>
                  <div><span className="text-muted-foreground">Bairro:</span> {profileData.customer.neighborhood || '—'}</div>
                  <div><span className="text-muted-foreground">CEP:</span> {profileData.customer.zipCode || '—'}</div>
                  <div><span className="text-muted-foreground">Renda:</span> {money(profileData.customer.monthlyIncome)}</div>
                  <div><span className="text-muted-foreground">Tempo no endereço:</span> {profileData.customer.residenceMonths ?? 0} meses</div>
                  <div><span className="text-muted-foreground">Cadastrado por:</span> {profileData.customer.createdBy?.name || '—'}</div>
                  {profileData.customer.notes && (
                    <div className="col-span-2"><span className="text-muted-foreground">Obs:</span> {profileData.customer.notes}</div>
                  )}
                </div>
              </div>

              {/* Contratos */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contratos vinculados</p>
                {profileData.customer.contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum contrato.</p>
                ) : (
                  <div className="space-y-2">
                    {profileData.customer.contracts.map((c) => (
                      <div key={c.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="font-medium">{c.product}</span>
                            <span className="text-muted-foreground ml-2">· {c.paidInstallments ?? 0}/{c.installmentCount} parcelas</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${contractStatusColors[c.status] ?? ''}`}>{c.status}</span>
                            {(c.overdueInstallments ?? 0) > 0 && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠ {c.overdueInstallments} atrasada(s)</span>
                            )}
                            <span className="font-mono font-semibold text-red-500">{money(c.pendingAmount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              {profileData.timeline.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Linha do tempo</p>
                  <div className="space-y-3">
                    {profileData.timeline.map((item, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-base leading-none mt-0.5">{timelineIcons[item.type] ?? '•'}</span>
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                          <p className="text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome completo *</Label>
                <Input {...register('name')} placeholder="Nome completo" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>CPF *</Label>
                <Input {...register('cpf')} placeholder="000.000.000-00" />
                {errors.cpf && <p className="text-xs text-destructive">{errors.cpf.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Data de nascimento</Label>
                <Input type="date" {...register('birthDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone 1</Label>
                <Input {...register('phone1')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone 2</Label>
                <Input {...register('phone2')} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Renda mensal (R$)</Label>
                <Input type="number" step="0.01" {...register('monthlyIncome')} />
              </div>
              <div className="space-y-1.5">
                <Label>Meses de residência</Label>
                <Input type="number" {...register('residenceMonths')} />
              </div>
            </div>

            {/* Endereço */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Endereço
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <Input {...register('zipCode')} placeholder="00000-000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input {...register('number')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Rua</Label>
                  <Input {...register('street')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input {...register('neighborhood')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Complemento</Label>
                  <Input {...register('complement')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input {...register('city')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Input {...register('state')} maxLength={2} placeholder="UF" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={currentStatus}
                onValueChange={(v) => v !== null && setValue('status', v as CustomerStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INADIMPLENTE">Inadimplente</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...register('notes')} rows={3} />
            </div>

            <Button type="submit" className="w-full bg-blue-600" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
