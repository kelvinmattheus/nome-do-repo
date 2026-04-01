'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

type FormData = z.infer<typeof schema>;

const Logo = () => (
  <svg width="160" height="40" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
    <g transform="translate(10, 5) scale(0.9)">
      <path d="M 15 50 L 30 15 L 50 40 L 70 15 L 90 35 L 70 55 L 50 40 L 30 65 L 50 85 L 85 80" stroke="url(#grad1)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M 15 50 L 30 65" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" fill="none"/>
      <path d="M 70 15 L 70 55" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" fill="none"/>
      <circle cx="15" cy="50" r="4" fill="#3B82F6"/>
      <circle cx="30" cy="15" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="50" cy="40" r="6" fill="#8B5CF6"/>
      <circle cx="70" cy="15" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="90" cy="35" r="4" fill="#8B5CF6"/>
      <circle cx="70" cy="55" r="4" fill="#3B82F6"/>
      <circle cx="30" cy="65" r="4" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="50" cy="85" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="85" cy="80" r="4" fill="#3B82F6"/>
    </g>
    <text x="105" y="65" fontFamily="'Sora', sans-serif" fontSize="42" fontWeight="900" fill="#3B82F6">
      Mi<tspan fontWeight="300" fill="#c084fc">Pixi</tspan>
    </text>
  </svg>
);

export default function LoginPage() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true);
      await login(data.email, data.password);
      toast.success('Login realizado com sucesso!');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Falha no login. Verifique suas credenciais.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, var(--blue-950) 0%, var(--blue-800) 50%, var(--blue-700) 100%)',
      }}
    >
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <p className="text-sm text-muted-foreground">
            Sistema de Gestão de Crédito &amp; Cobrança
          </p>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full mt-2 bg-blue-600"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
