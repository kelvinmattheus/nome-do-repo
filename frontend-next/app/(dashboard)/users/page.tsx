'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { dateBR } from '@/lib/formatters';
import type { User, UserRole } from '@/types';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'COLLECTOR']),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'COLLECTOR', isActive: true },
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<User[]>('/users');
      setUsers(data || []);
    } catch {
      toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDrawer(item?: User) {
    setEditing(item || null);
    if (item) {
      reset({ name: item.name, email: item.email, role: item.role, isActive: item.isActive, password: '' });
    } else {
      reset({ role: 'COLLECTOR', isActive: true, password: '' });
    }
    setDrawerOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload = { ...data };
      if (!payload.password) delete payload.password;
      if (editing) {
        await api.put(`/users/${editing.id}`, payload);
        toast.success('Usuário atualizado.');
      } else {
        await api.post('/users', payload);
        toast.success('Usuário criado.');
      }
      setDrawerOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao salvar usuário.'));
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success('Usuário removido.');
      load();
    } catch {
      toast.error('Erro ao remover usuário.');
    }
  };

  const currentRole = watch('role');
  const currentIsActive = watch('isActive');

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie os usuários do sistema"
        extra={
          <Button size="sm" onClick={() => openDrawer()} className="bg-blue-600">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo usuário
          </Button>
        }
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum usuário encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {u.role === 'ADMIN' ? 'Administrador' : 'Cobrador'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {dateBR(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDrawer(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" />}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(u.id)}>Remover</AlertDialogAction>
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
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-muted-foreground">{users.length} usuário(s)</p>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Editar usuário' : 'Novo usuário'}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input {...register('name')} placeholder="Nome completo" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>E-mail *</Label>
              <Input type="email" {...register('email')} placeholder="email@exemplo.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}</Label>
              <Input type="password" {...register('password')} placeholder="••••••••" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={currentRole} onValueChange={(v) => v !== null && setValue('role', v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="COLLECTOR">Cobrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={currentIsActive}
                onCheckedChange={(v) => setValue('isActive', Boolean(v))}
              />
              <Label htmlFor="isActive" className="cursor-pointer">Usuário ativo</Label>
            </div>
            <Button type="submit" className="w-full bg-blue-600" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : editing ? 'Atualizar' : 'Criar usuário'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
