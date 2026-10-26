'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Download,
  FlaskConical,
  Gauge,
  GitBranch,
  Radar,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from 'lucide-react';
import { FeatureDriftRow, MethodKey, Severity } from '@/types';
import { useApp } from '@/context/AppContext';
import { useMonitorData } from '@/hooks/useMonitorData';
import { DELIVERABLES } from '@/data/platform';
import { PERSONAS } from '@/data/thresholds';
import {
  METHOD_META,
  SEVERITY_META,
  cx,
  downloadJson,
  formatDecimal,
} from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoRow,
  KpiCard,
  Meter,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { DriftChart } from '@/components/DriftChart';
import { FeatureDriftTable } from '@/components/FeatureDrift';
import { AlertPanel } from '@/components/AlertPanel';
import { FeatureDetailDrawer } from '@/components/drift/FeatureDetailDrawer';
import { ThresholdEditor } from '@/components/drift/ThresholdEditor';
import { E3Comparison } from '@/components/drift/E3Comparison';
import { DriftSandbox } from '@/components/drift/DriftSandbox';

const ANCHORS = [
  { id: 'features', label: 'Features', icon: Radar },
  { id: 'limiares', label: 'Limiares', icon: SlidersHorizontal },
  { id: 'alertas', label: 'Alertas', icon: BellRing },
  { id: 'e3', label: 'E3', icon: GitBranch },
  { id: 'sandbox', label: 'Sandbox', icon: FlaskConical },
];

export default function DriftPage() {
  const router = useRouter();
  const { selectedExperiment, experimentsLoading, refreshAll, thresholds } = useApp();
  const data = useMonitorData(selectedExperiment);
  const [drawerRow, setDrawerRow] = useState<FeatureDriftRow | null>(null);

  const severityCounts = useMemo<Record<Severity, number>>(() => {
    if (!data) return { none: 0, warning: 0, critical: 0 };
    return data.features.reduce<Record<Severity, number>>(
      (acc, row) => {
        acc[row.severity] += 1;
        return acc;
      },
      { none: 0, warning: 0, critical: 0 },
    );
  }, [data]);

  if (experimentsLoading && !selectedExperiment) return <PageSkeleton />;

  if (!selectedExperiment) {
    return (
      <EmptyState
        title="Nenhum experimento selecionado"
        description="Selecione ou crie um experimento para analisar o drift."
        action={
          <Button variant="primary" onClick={() => router.push('/experimentos')}>
            Abrir experimentos
          </Button>
        }
      />
    );
  }

  if (!data) return <PageSkeleton />;

  const psiSeries = data.driftTimeline.map((point) => point.psi);
  const jsSeries = data.driftTimeline.map((point) => point.js);
  const ksSeries = data.driftTimeline.map((point) => point.ks);
  const driftedSeries = data.driftTimeline.map((point) => point.drifted);
  const currentWindow = data.driftTimeline[data.driftTimeline.length - 1];
  const activeAlerts = data.alerts.filter((alert) => !alert.isResolved);
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === 'critical');

  const methodSummary: {
    key: MethodKey;
    value: number | null;
    critical: number;
    warning: number;
    direction: 'above' | 'below';
    detail: string;
  }[] = [
    {
      key: 'psi',
      value: data.summary.max_psi,
      critical: thresholds.psi.critical,
      warning: thresholds.psi.warning,
      direction: 'above',
      detail: 'população por faixas de referência',
    },
    {
      key: 'ks',
      value: data.summary.max_ks,
      critical: thresholds.ks.critical,
      warning: thresholds.ks.warning,
      direction: 'below',
      detail: 'estatística D · decisão pelo p-valor',
    },
    {
      key: 'js',
      value: data.summary.max_js,
      critical: thresholds.js.critical,
      warning: thresholds.js.warning,
      direction: 'above',
      detail: 'distância simétrica com correção de viés',
    },
    {
      key: 'wasserstein',
      value: data.summary.max_wasserstein,
      critical: thresholds.wasserstein.critical,
      warning: thresholds.wasserstein.warning,
      direction: 'above',
      detail: 'transporte normalizado pelo desvio da referência',
    },
  ];

  const exportSnapshot = () => {
    downloadJson(
      `drift-${data.experiment.id}-${new Date().toISOString().slice(0, 10)}.json`,
      {
        generatedAt: new Date().toISOString(),
        experiment: data.experiment,
        source: data.source,
        summary: data.summary,
        thresholds,
        features: data.features,
        timeline: data.driftTimeline,
        alerts: data.alerts,
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 2 · Drift & Estatística"
        persona="Pessoa 2"
        title="Laboratório de drift e estatística"
        description="PSI, Kolmogorov-Smirnov, Jensen-Shannon e Wasserstein por feature, com limiares configuráveis, alertas e a comparação de sensibilidade do experimento E3."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={exportSnapshot}>
              Exportar JSON
            </Button>
            <Button variant="outline" icon={RefreshCw} onClick={refreshAll}>
              Sincronizar
            </Button>
            <Button
              variant="primary"
              icon={SlidersHorizontal}
              onClick={() =>
                document.getElementById('limiares')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Ajustar limiares
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="PSI máximo"
            value={formatDecimal(data.summary.max_psi, 3)}
            icon={Activity}
            hint={`limiares ${thresholds.psi.warning}/${thresholds.psi.critical}`}
            spark={psiSeries}
            tone={data.summary.max_psi >= thresholds.psi.critical ? 'danger' : 'warn'}
          />
          <KpiCard
            label="KS máximo (D)"
            value={formatDecimal(data.summary.max_ks, 3)}
            icon={Waves}
            hint={`p crítico ≤ ${thresholds.ks.critical}`}
            spark={ksSeries}
            tone="info"
          />
          <KpiCard
            label="Jensen-Shannon máximo"
            value={formatDecimal(data.summary.max_js, 3)}
            icon={Gauge}
            hint={`limiares ${thresholds.js.warning}/${thresholds.js.critical}`}
            spark={jsSeries}
            tone={
              data.summary.max_js >= thresholds.js.critical
                ? 'danger'
                : data.summary.max_js >= thresholds.js.warning
                  ? 'warn'
                  : 'brand'
            }
          />
          <KpiCard
            label="Features em drift"
            value={`${data.summary.drifted_features.length}/${data.features.length}`}
            icon={Radar}
            hint={`${severityCounts.critical} críticas · ${activeAlerts.length} alertas ativos`}
            spark={driftedSeries}
            tone={severityCounts.critical > 0 ? 'danger' : 'warn'}
          />
        </div>

        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {ANCHORS.map((anchor) => {
            const Icon = anchor.icon;
            return (
              <a
                key={anchor.id}
                href={`#${anchor.id}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-elevated/40 px-3 py-1.5 text-[10px] font-medium text-muted transition hover:border-brand/35 hover:text-ink"
              >
                <Icon className="h-3 w-3" />
                {anchor.label}
              </a>
            );
          })}
          <span className="ml-auto hidden shrink-0 items-center gap-1 text-[10px] text-muted sm:flex">
            <ShieldAlert className="h-3 w-3 text-warn" />
            {criticalAlerts.length} crítico{criticalAlerts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <DriftChart data={data.driftTimeline} thresholds={thresholds} className="xl:col-span-2" />
          <Card>
            <CardHeader
              icon={GitBranch}
              title="Leitura da janela"
              description={`Resumo de ${currentWindow?.window ?? '—'} e máximos por método.`}
              actions={
                <Badge tone={severityCounts.critical > 0 ? 'danger' : 'brand'} dot>
                  {severityCounts.critical > 0 ? 'ação requerida' : 'estável'}
                </Badge>
              }
            />
            <div className="mt-3 space-y-2.5">
              {methodSummary.map((item) => {
                const meta = METHOD_META[item.key];
                const severity =
                  item.key === 'ks'
                    ? item.value !== null && item.value > 0.2
                      ? 'warning'
                      : 'none'
                    : item.value !== null && item.value >= item.critical
                      ? 'critical'
                      : item.value !== null && item.value >= item.warning
                        ? 'warning'
                        : 'none';
                return (
                  <div key={item.key}>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: meta.color }}
                          />
                          <span className="text-[11px] font-semibold text-ink">
                            {meta.short}
                          </span>
                          <span className="text-[9px] text-muted">{meta.label}</span>
                        </div>
                        <p className="mt-0.5 text-[9px] text-muted">{item.detail}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={cx(
                            'mono text-xs font-semibold',
                            severity === 'critical'
                              ? 'text-danger'
                              : severity === 'warning'
                                ? 'text-warn'
                                : 'text-ink',
                          )}
                        >
                          {formatDecimal(item.value, 3)}
                        </span>
                        <p className="text-[9px] text-muted">
                          {item.direction === 'above' ? '≥' : '≤'} {item.critical}
                        </p>
                      </div>
                    </div>
                    <Meter
                      value={Math.min(item.value ?? 0, item.direction === 'below' ? 0.5 : item.critical * 1.5)}
                      max={item.direction === 'below' ? 0.5 : item.critical * 1.5}
                      tone={severity === 'critical' ? 'danger' : severity === 'warning' ? 'warn' : 'brand'}
                      height="h-1"
                      className="mt-1"
                      thresholds={[
                        {
                          value:
                            item.direction === 'below'
                              ? 0.25
                              : item.critical,
                          tone: 'danger',
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {(['none', 'warning', 'critical'] as Severity[]).map((severity) => (
                <div
                  key={severity}
                  className="rounded-lg border border-line/60 bg-elevated/30 px-2 py-1.5 text-center"
                >
                  <p className="text-[9px] text-muted">{SEVERITY_META[severity].label}</p>
                  <p className={cx('mono mt-0.5 text-sm font-semibold', SEVERITY_META[severity].text)}>
                    {severityCounts[severity]}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-line/60 pt-2">
              <InfoRow label="Última janela" value={currentWindow?.window ?? '—'} mono />
              <InfoRow label="PSI da janela" value={formatDecimal(currentWindow?.psi, 4)} mono />
              <InfoRow label="JS da janela" value={formatDecimal(currentWindow?.js, 4)} mono />
              <InfoRow label="Alertas ativos" value={String(activeAlerts.length)} mono />
            </div>
          </Card>
        </div>

        <section id="features" className="scroll-mt-24">
          <FeatureDriftTable
            rows={data.features}
            thresholds={thresholds}
            onSelect={setDrawerRow}
          />
        </section>

        <section id="limiares" className="scroll-mt-24">
          <ThresholdEditor />
        </section>

        <section id="alertas" className="scroll-mt-24">
          <AlertPanel
            alerts={data.alerts}
            includeResolved
            className="w-full"
          />
        </section>

        <section id="e3" className="scroll-mt-24">
          <E3Comparison />
        </section>

        <section id="sandbox" className="scroll-mt-24">
          <DriftSandbox />
        </section>

        <Card>
          <CardHeader
            icon={Sparkles}
            title="Escopo da Pessoa 2"
            description="Métodos estatísticos, limiares, alertas e o experimento E3."
            actions={<Badge tone="info">D3 · E3</Badge>}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: 'Métricas',
                detail: 'PSI por quantis, KS com p-valor assintótico, JS corrigido e W₁ normalizado.',
                icon: Activity,
              },
              {
                title: 'Limiares',
                detail: 'Configuração local de atenção/crítico por método e severidade de gatilho.',
                icon: SlidersHorizontal,
              },
              {
                title: 'Alertas',
                detail: 'Gatilho por severidade, cooldown e resolução com persistência local/API.',
                icon: BellRing,
              },
              {
                title: 'E3',
                detail: `${200} repetições comparando AUC, sensibilidade, FPR e latência.`,
                icon: GitBranch,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-line/70 bg-elevated/25 p-3"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-info/25 bg-info/10 text-info">
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
                {PERSONAS.p2.responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10px] text-muted">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-info" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label mb-1.5">Entregáveis</p>
              <div className="flex flex-wrap gap-1.5">
                {DELIVERABLES.filter(
                  (item) => item.owner === 'Pessoa 2' || item.owner === 'Todas',
                ).map((item) => (
                  <Badge key={item.id} tone={item.owner === 'Pessoa 2' ? 'info' : 'neutral'}>
                    {item.id} · {item.label}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 !px-0"
                iconRight={ArrowRight}
                onClick={() => router.push('/modelo')}
              >
                Voltar ao modelo e simulador
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <FeatureDetailDrawer
        open={Boolean(drawerRow)}
        onClose={() => setDrawerRow(null)}
        row={drawerRow}
        experiment={data.experiment}
        thresholds={thresholds}
      />
    </>
  );
}
