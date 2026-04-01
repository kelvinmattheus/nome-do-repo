'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money, dateBR } from '@/lib/formatters';
import type { Product, StockMovement, StockSummary } from '@/types';
import dayjs from 'dayjs';
import { cn, getErrorMessage } from '@/lib/utils';

const productSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  unit: z.string().min(1, 'Unidade obrigatória'),
  packageUnit: z.string().optional(),
  packageQty: z.coerce.number().optional(),
  minStock: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  expiryDate: z.string().optional().nullable(),
});

const movementSchema = z.object({
  productId: z.string().min(1, 'Produto obrigatório'),
  type: z.string().min(1),
  quantity: z.coerce.number().min(1),
  unitCost: z.coerce.number().min(0),
  salePrice: z.coerce.number().optional().nullable(),
  destination: z.string().optional(),
  reason: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;
type MovementFormData = z.infer<typeof movementSchema>;

const movementTypeColors: Record<string, string> = {
  ENTRADA: 'bg-green-100 text-green-800',
  SAIDA: 'bg-blue-100 text-blue-800',
  AVARIA: 'bg-orange-100 text-orange-800',
  TROCA: 'bg-purple-100 text-purple-800',
  AJUSTE_POSITIVO: 'bg-cyan-100 text-cyan-800',
  AJUSTE_NEGATIVO: 'bg-red-100 text-red-800',
  ESTORNO: 'bg-gray-100 text-gray-700',
};

export default function EstoquePage() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [productDrawer, setProductDrawer] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementModal, setMovementModal] = useState(false);
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());

  const productForm = useForm<ProductFormData>({ resolver: zodResolver(productSchema) });
  const movementForm = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'ENTRADA', quantity: 1, unitCost: 0 },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [prodRes, sumRes] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StockSummary & { movimentos?: StockMovement[] }>('/stock/summary', {
          params: { month, year },
        }),
      ]);
      setProducts(prodRes.data || []);
      setSummary(sumRes.data);
      setMovements(sumRes.data.movimentos || []);
    } catch {
      toast.error('Erro ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function openProductDrawer(item?: Product) {
    setEditingProduct(item || null);
    if (item) {
      productForm.reset({
        ...item,
        expiryDate: item.expiryDate?.slice(0, 10) || null,
      });
    } else {
      productForm.reset({ unit: 'un', minStock: 0, costPrice: 0, salePrice: 0 });
    }
    setProductDrawer(true);
  }

  const onSaveProduct = async (data: ProductFormData) => {
    try {
      const payload = { ...data, expiryDate: data.expiryDate || null };
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Produto atualizado.');
      } else {
        await api.post('/products', payload);
        toast.success('Produto cadastrado.');
      }
      setProductDrawer(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar produto.'));
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await api.delete(`/products/${id}`);
      toast.success('Produto removido.');
      load();
    } catch {
      toast.error('Erro ao remover produto.');
    }
  };

  const onSaveMovement = async (data: MovementFormData) => {
    try {
      await api.post('/stock/movements', {
        ...data,
        salePrice: data.salePrice || null,
      });
      toast.success('Movimentação registrada.');
      setMovementModal(false);
      movementForm.reset({ type: 'ENTRADA', quantity: 1, unitCost: 0 });
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao registrar movimentação.'));
    }
  };

  const reverseMovement = async (id: string) => {
    try {
      await api.post(`/stock/movements/${id}/reverse`);
      toast.success('Estorno realizado.');
      load();
    } catch {
      toast.error('Erro ao estornar.');
    }
  };

  const deleteMovement = async (id: string) => {
    try {
      await api.delete(`/stock/movements/${id}/delete-with-reverse`);
      toast.success('Excluído e estoque revertido.');
      load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  const currentType = movementForm.watch('type');
  const currentProductId = movementForm.watch('productId');

  const months = [
    { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' }, { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' }, { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' },
  ];
  const years = Array.from({ length: 5 }, (_, i) => dayjs().year() - 2 + i);

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="Estoque"
        subtitle="Controle de produtos e movimentações"
        extra={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { movementForm.reset({ type: 'ENTRADA', quantity: 1, unitCost: 0 }); setMovementModal(true); }}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
              Movimentação
            </Button>
            <Button size="sm" onClick={() => openProductDrawer()} className="bg-blue-600">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Produto
            </Button>
          </div>
        }
      />

      {/* Resumo */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Produtos</p>
              <p className="text-2xl font-bold font-mono mt-1">{summary.totalProducts}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Itens em estoque</p>
              <p className="text-2xl font-bold font-mono mt-1">{summary.totalItems}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor custo</p>
              <p className="text-2xl font-bold font-mono mt-1 text-blue-600">{money(summary.totalCostValue)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor venda</p>
              <p className="text-2xl font-bold font-mono mt-1 text-green-500">{money(summary.totalSaleValue)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="movements">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Un.</TableHead>
                    <TableHead className="text-center">Estoque</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Custo</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Venda</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Total</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        {loading ? 'Carregando...' : 'Nenhum produto cadastrado.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p) => {
                      const lowStock = p.minStock > 0 && p.currentStock <= p.minStock;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{p.name}</p>
                              {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{p.unit}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn("font-mono font-bold text-sm", lowStock ? 'text-red-500' : p.currentStock === 0 ? 'text-slate-300' : 'text-green-500')}
                            >
                              {p.currentStock}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm hidden md:table-cell">{money(p.costPrice)}</TableCell>
                          <TableCell className="text-right font-mono text-sm hidden md:table-cell">{money(p.salePrice)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold hidden lg:table-cell">
                            {money(p.currentStock * p.costPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openProductDrawer(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover produto?</AlertDialogTitle>
                                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteProduct(p.id)}>Remover</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <div className="flex gap-2 mb-4 flex-wrap">
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
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Custo total</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Nenhuma movimentação no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div>
                            <p className="text-xs text-muted-foreground">{dateBR(m.createdAt)}</p>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block ${movementTypeColors[m.type] || 'bg-gray-100 text-gray-700'}`}>
                              {m.type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{m.product?.name}</p>
                            <p className="text-xs text-muted-foreground">{m.destination || m.reason || ''}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-sm">{m.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm hidden md:table-cell">
                          {money(m.quantity * m.unitCost)}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.type !== 'ESTORNO' && (
                            <div className="flex gap-1 justify-end">
                              <AlertDialog>
                                <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="h-6 text-xs text-amber-600 hover:text-amber-700" />}>
                                  ↩ Estornar
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Estornar movimentação?</AlertDialogTitle>
                                    <AlertDialogDescription>Reverte o estoque.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => reverseMovement(m.id)}>Estornar</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <AlertDialog>
                                <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" />}>
                                  <Trash2 className="h-3 w-3" />
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir e estornar?</AlertDialogTitle>
                                    <AlertDialogDescription>Estorna e remove o registro.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteMovement(m.id)}>Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drawer produto */}
      <Sheet open={productDrawer} onOpenChange={setProductDrawer}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingProduct ? 'Editar produto' : 'Novo produto'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={productForm.handleSubmit(onSaveProduct)} className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input {...productForm.register('name')} />
                {productForm.formState.errors.name && <p className="text-xs text-destructive">{productForm.formState.errors.name.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Descrição</Label>
                <Input {...productForm.register('description')} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade *</Label>
                <Input {...productForm.register('unit')} placeholder="un, kg, cx..." />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque mínimo</Label>
                <Input type="number" {...productForm.register('minStock')} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço de custo (R$)</Label>
                <Input type="number" step="0.01" {...productForm.register('costPrice')} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço de venda (R$)</Label>
                <Input type="number" step="0.01" {...productForm.register('salePrice')} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Data de validade</Label>
                <Input type="date" {...productForm.register('expiryDate')} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-blue-600" disabled={productForm.formState.isSubmitting}>
              {productForm.formState.isSubmitting ? 'Salvando...' : editingProduct ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Modal movimentação */}
      <Dialog open={movementModal} onOpenChange={setMovementModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar movimentação</DialogTitle>
          </DialogHeader>
          <form onSubmit={movementForm.handleSubmit(onSaveMovement)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Produto *</Label>
                <Select value={currentProductId} onValueChange={(v) => v !== null && movementForm.setValue('productId', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (estoque: {p.currentStock})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Tipo</Label>
                <Select value={currentType} onValueChange={(v) => v !== null && movementForm.setValue('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ENTRADA', 'SAIDA', 'AVARIA', 'TROCA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade *</Label>
                <Input type="number" min={1} {...movementForm.register('quantity')} />
              </div>
              <div className="space-y-1.5">
                <Label>Custo unitário (R$)</Label>
                <Input type="number" step="0.01" {...movementForm.register('unitCost')} />
              </div>
              {currentType === 'SAIDA' && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Preço de venda (R$)</Label>
                  <Input type="number" step="0.01" {...movementForm.register('salePrice')} />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Destino / Motivo</Label>
                <Input {...movementForm.register('destination')} placeholder="Opcional" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-blue-600" disabled={movementForm.formState.isSubmitting}>
              {movementForm.formState.isSubmitting ? 'Registrando...' : 'Registrar movimentação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
