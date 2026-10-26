'use client';

import React from 'react';
import { useRouter } from 'next/router';
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  FlaskConical,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useMonitorData } from '@/hooks/useMonitorData';
import { DELIVERABLES } from '@/data/platform';
import { PERSONAS } from '@/data/thresholds';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { MetricsChart } from '@/components/MetricsChart';
import {
  DatasetCard,
  FeatureImportanceCard,
  ModelCard,
  ScenarioTable,
} from '@/components/model/ModelCard';
import { SimulatorPanel } from '@/components/model/SimulatorPanel';
import { RetrainPanel } from '@/components/model/RetrainPanel';

export default function ModelPage() {
  const router = useRouter();
  const { selectedExperiment, experimentsLoading, refreshAll } = useApp();
  const data = useMonitorData(selectedExperiment);

  if (experimentsLoading && !selectedExperiment) return <PageSkeleton />;

  if (!selectedExperiment) {
    return (
      <EmptyState
        title="Nenhum experimento selecionado"
        description="Selecione um experimento para inspecionar o modelo, as features e o simulador."
        action={
          <Button variant="primary" onClick={() => router.push('/experimentos')}>
            Abrir experimentos
          </Button>
        }
      />
    );
  }

  if (!data) return <PageSkeleton />;

  const latest = data.performance[data.performance.length - 1];

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 1 · ML & Dados"
        persona="Pessoa 1"
        title="Modelo, dados e simulador"
        description="Inspecione o artefato XGBoost, a engenharia de features, os cenários de drift e o ciclo de retreinamento orientado por alertas."
        actions={
          <>
            <Button variant="outline" icon={RefreshCw} onClick={refreshAll}>
              Sincronizar
            </Button>
            <Button
              variant="secondary"
              icon={Activity}
              onClick={() => router.push('/drift')}
            >
              Ver drift
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

      <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ModelCard model={data.model} experiment={data.experiment} latest={latest} />
          </div>
          <DatasetCard model={data.model} experiment={data.experiment} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <MetricsChart
            data={data.performance}
            className="xl:col-span-2"
            title="Performance do modelo nas janelas"
            description="Série simulada com degradação progressiva conforme o cenário de drift."
            footer={
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                <span>
                  Baseline F1: <span className="mono text-ink">{data.performance[0]?.f1.toFixed(4)}</span>
                </span>
                <span>
                  Última janela:{' '}
                  <span className="mono text-ink">{latest?.label ?? '—'}</span>
                </span>
                <span>
                  Predições:{' '}
                  <span className="mono text-ink">
                    {latest?.totalPredictions.toLocaleString('pt-BR') ?? '—'}
                  </span>
                </span>
              </div>
            }
          />
          <div>
            <ScenarioTable currentLevel={data.experiment.drift_level} />
          </div>
        </div>

        <SimulatorPanel experiment={data.experiment} />

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <RetrainPanel
              experiment={data.experiment}
              records={data.retrainRecords}
              currentF1={latest?.f1 ?? data.model.trainingMetrics.f1}
            />
          </div>
          <FeatureImportanceCard model={data.model} />
        </div>

        <Card>
          <CardHeader
            icon={Sparkles}
            title="Escopo da Pessoa 1"
            description="Entregas e responsabilidades cobertas por esta visão."
            actions={<Badge tone="brand">D1 · D2</Badge>}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: Database,
                title: 'Dataset',
                detail: 'PaySim processado, engenharia de features e split temporal.',
              },
              {
                icon: Boxes,
                title: 'Modelo',
                detail: 'XGBoost baseline com métricas de treino e importância.',
              },
              {
                icon: Activity,
                title: 'Simulador',
                detail: 'Cenários none/low/moderate/high e avanço de janelas.',
              },
              {
                icon: FlaskConical,
                title: 'Retreino',
                detail: 'E4: disparo, nova versão e recuperação de F1.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-line/70 bg-elevated/25 p-3"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="mt-2 text-xs font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{item.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 border-t border-line/60 pt-3 sm:grid-cols-2">
            <div>
              <p className="label mb-1.5">Responsabilidades</p>
              <ul className="space-y-1">
                {PERSONAS.p1.responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10px] text-muted">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label mb-1.5">Entregáveis</p>
              <div className="flex flex-wrap gap-1.5">
                {DELIVERABLES.filter((item) => item.owner === 'Pessoa 1').map((item) => (
                  <Badge key={item.id} tone="brand">
                    {item.id} · {item.label}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 !px-0"
                iconRight={ArrowRight}
                onClick={() => router.push('/drift')}
              >
                Ver validação estatística na Pessoa 2
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
