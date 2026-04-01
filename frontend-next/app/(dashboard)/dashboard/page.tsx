'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { money } from '@/lib/formatters';
import type { DashboardSummary } from '@/types';

function MetricCard({
  title,
  value,
  icon,
  color,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {title}
            </p>
            <p className="text-2xl font-bold font-mono" style={{ color }}>
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}
          >
            <span style={{ color }}>{icon}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get<DashboardSummary>('/dashboard/summary');
      setSummary(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Resumo"
        subtitle="Visão geral do mês atual"
        extra={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        }
      />

      {/* Métricas financeiras */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Previsto no mês"
          value={money(summary?.valueOpenMonth)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="var(--blue-500)"
        />
        <MetricCard
          title="Recebido no mês"
          value={money(summary?.valueReceivedMonth)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="var(--green-500)"
        />
        <MetricCard
          title="A receber"
          value={money(summary?.missingToReceiveMonth)}
          icon={<TrendingDown className="h-5 w-5" />}
          color="var(--amber-500)"
        />
        <MetricCard
          title="Parcelas atrasadas"
          value={String(summary?.overdueInstallments ?? 0)}
          icon={<AlertCircle className="h-5 w-5" />}
          color="var(--red-500)"
          sub={`${summary?.customersInArrears ?? 0} cliente(s) inadimplente(s)`}
        />
      </div>

      {/* Métricas gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total de clientes"
          value={String(summary?.customersCount ?? 0)}
          icon={<Users className="h-5 w-5" />}
          color="var(--blue-400)"
        />
        <MetricCard
          title="Contratos ativos"
          value={String(summary?.contractsCount ?? 0)}
          icon={<FileText className="h-5 w-5" />}
          color="var(--purple-500)"
        />
        <MetricCard
          title="Total vendido"
          value={money(summary?.totalSold)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="var(--blue-600)"
        />
        <MetricCard
          title="Ticket médio"
          value={money(summary?.ticketAverage)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="var(--gold-500)"
        />
      </div>

      {/* Cobradores do dia */}
      {summary?.collectorsDaily && summary.collectorsDaily.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Cobradores — hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {summary.collectorsDaily.map((c, i) => (
                <div key={c.id}>
                  {i > 0 && <Separator className="my-2" />}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.paymentsToday} pagamento(s)</p>
                    </div>
                    <div className="text-right">
                      <p
                        className="text-sm font-bold font-mono text-green-500"
                      >
                        {money(c.receivedToday)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distribuições hoje */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{summary?.assignmentsToday ?? 0}</Badge>
        distribuições feitas hoje
      </div>
    </div>
  );
}
