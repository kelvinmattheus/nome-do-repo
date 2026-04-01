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
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money } from '@/lib/formatters';
import type { Basket, Product } from '@/types';
import { cn, getErrorMessage } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  salePrice: z.coerce.number().min(0),
});

const movementSchema = z.object({
  basketId: z.string().min(1),
  type: z.string().min(1),
  quantity: z.coerce.number().min(1),
  unitCost: z.coerce.number().min(0),
  salePrice: z.coerce.number().optional().nullable(),
  destination: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type MovementFormData = z.infer<typeof movementSchema>;

interface BasketItem {
  productId: string;
  quantity: number;
}

export default function CestasPage() {
  const { isAdmin } = useAuth();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBasket, setEditingBasket] = useState<Basket | null>(null);
  const [basketItems, setBasketItems] = useState<BasketItem[]>([{ productId: '', quantity: 1 }]);
  const [movementModal, setMovementModal] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });
  const movForm = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'MONTAGEM', quantity: 1, unitCost: 0 },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [basketRes, prodRes] = await Promise.all([
        api.get<Basket[]>('/baskets'),
        api.get<Product[]>('/products'),
      ]);
      setBaskets(basketRes.data || []);
      setProducts(prodRes.data || []);
    } catch {
      toast.error('Erro ao carregar cestas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDrawer(item?: Basket) {
    setEditingBasket(item || null);
    if (item) {
      form.reset({ name: item.name, description: item.description, salePrice: item.salePrice });
      setBasketItems(item.items?.map((i) => ({ productId: i.productId, quantity: i.quantity })) || [{ productId: '', quantity: 1 }]);
    } else {
      form.reset({ salePrice: 0 });
      setBasketItems([{ productId: '', quantity: 1 }]);
    }
    setDrawerOpen(true);
  }

  const onSave = async (data: FormData) => {
    const items = basketItems.filter((i) => i.productId);
    if (items.length === 0) {
      toast.error('Adicione pelo menos um produto à cesta.');
      return;
    }
    try {
      const payload = { ...data, items };
      if (editingBasket) {
        await api.put(`/baskets/${editingBasket.id}`, payload);
        toast.success('Cesta atualizada.');
      } else {
        await api.post('/baskets', payload);
        toast.success('Cesta cadastrada.');
      }
      setDrawerOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar cesta.'));
    }
  };

  const deleteBasket = async (id: string) => {
    try {
      await api.delete(`/baskets/${id}`);
      toast.success('Cesta removida.');
      load();
    } catch {
      toast.error('Erro ao remover cesta.');
    }
  };

  const onSaveMovement = async (data: MovementFormData) => {
    try {
      await api.post('/baskets/movements', { ...data, salePrice: data.salePrice || null });
      toast.success('Movimentação registrada.');
      setMovementModal(false);
      movForm.reset({ type: 'MONTAGEM', quantity: 1, unitCost: 0 });
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao registrar movimentação.'));
    }
  };

  const addItem = () => setBasketItems((prev) => [...prev, { productId: '', quantity: 1 }]);
  const removeItem = (i: number) => setBasketItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof BasketItem, value: string | number) =>
    setBasketItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const currentBasketId = movForm.watch('basketId');
  const currentType = movForm.watch('type');

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Cestas Básicas"
        subtitle="Gerencie cestas e movimentações"
        extra={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { movForm.reset({ type: 'MONTAGEM', quantity: 1, unitCost: 0 }); setMovementModal(true); }}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
              Movimentação
            </Button>
            <Button size="sm" onClick={() => openDrawer()} className="bg-blue-600">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nova cesta
            </Button>
          </div>
        }
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cesta</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-right hidden md:table-cell">Custo</TableHead>
                <TableHead className="text-right hidden md:table-cell">Venda</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baskets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhuma cesta cadastrada.'}
                  </TableCell>
                </TableRow>
              ) : (
                baskets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{b.name}</p>
                        {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                        {b.items && b.items.length > 0 && (
                          <p className="text-xs text-muted-foreground">{b.items.length} produto(s)</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn("font-mono font-bold text-sm", b.currentStock === 0 ? 'text-slate-300' : 'text-green-500')}
                      >
                        {b.currentStock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell">{money(b.costPrice)}</TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell">{money(b.salePrice)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover cesta?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteBasket(b.id)}>Remover</AlertDialogAction>
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

      {/* Drawer cesta */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingBasket ? 'Editar cesta' : 'Nova cesta'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input {...form.register('name')} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input {...form.register('description')} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço de venda (R$)</Label>
              <Input type="number" step="0.01" {...form.register('salePrice')} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Produtos da cesta</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {basketItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <Select
                        value={item.productId}
                        onValueChange={(v) => v !== null && updateItem(idx, 'productId', v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Produto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min={1}
                        className="h-8"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full bg-blue-600" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando...' : editingBasket ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Modal movimentação */}
      <Dialog open={movementModal} onOpenChange={setMovementModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentação de cesta</DialogTitle>
          </DialogHeader>
          <form onSubmit={movForm.handleSubmit(onSaveMovement)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Cesta *</Label>
              <Select value={currentBasketId} onValueChange={(v) => v !== null && movForm.setValue('basketId', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {baskets.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} (estoque: {b.currentStock})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={currentType} onValueChange={(v) => v !== null && movForm.setValue('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['MONTAGEM', 'VENDA', 'DESMONTAGEM', 'AVARIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade *</Label>
                <Input type="number" min={1} {...movForm.register('quantity')} />
              </div>
              <div className="space-y-1.5">
                <Label>Custo unitário (R$)</Label>
                <Input type="number" step="0.01" {...movForm.register('unitCost')} />
              </div>
              {currentType === 'VENDA' && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Preço de venda (R$)</Label>
                  <Input type="number" step="0.01" {...movForm.register('salePrice')} />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Destino</Label>
                <Input {...movForm.register('destination')} placeholder="Opcional" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-blue-600" disabled={movForm.formState.isSubmitting}>
              {movForm.formState.isSubmitting ? 'Registrando...' : 'Registrar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
