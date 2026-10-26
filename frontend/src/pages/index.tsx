'use client';

import React from 'react';
import { useRouter } from 'next/router';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useMonitorData } from '@/hooks/useMonitorData';
import { Button, EmptyState, PageHeader, PageSkeleton } from '@/components/ui';
import { Dashboard } from '@/components/Dashboard';

export default function OverviewPage() {
  const router = useRouter();
  const { selectedExperiment, experimentsLoading, refreshAll } = useApp();
  const data = useMonitorData(selectedExperiment);

  if (experimentsLoading && !selectedExperiment) {
    return <PageSkeleton />;
  }

  if (!selectedExperiment) {
    return (
      <EmptyState
        title="Nenhum experimento disponível"
        description="Crie um experimento para começar a monitorar drift e performance."
        action={
          <Button variant="primary" icon={FlaskConical} onClick={() => router.push('/experimentos')}>
            Abrir experimentos
          </Button>
        }
      />
    );
  }

  if (!data) {
    return <PageSkeleton />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 3 · Dashboard"
        persona="Pessoa 3"
        title="Visão geral do monitoramento"
        description="KPIs de produção, degradação do modelo, evolução do drift e alertas em uma única visão — com fallback determinístico quando a API está offline."
        actions={
          <>
            <Button variant="outline" icon={RefreshCw} onClick={refreshAll}>
              Sincronizar
            </Button>
            <Button
              variant="primary"
              icon={FlaskConical}
              onClick={() => router.push('/experimentos')}
            >
              Experimentos
            </Button>
          </>
        }
      />
      <Dashboard data={data} />
    </>
  );
}
