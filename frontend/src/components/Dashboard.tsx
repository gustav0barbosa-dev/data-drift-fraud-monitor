'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  Radar,
  ShieldAlert,
  Target,
  TrendingDown,
  Wrench,
} from 'lucide-react';
import { DriftLevel, Severity } from '@/types';
import { DRIFT_LEVEL_META, METHOD_META, SEVERITY_META, STATUS_META, cx, formatCompact, formatDateTime, formatDecimal, formatPct, timeAgo } from '@/lib/utils';
import { E3_DATA } from '@/data/e3';
import { PERSONAS, SCENARIO_PERFORMANCE } from '@/data/thresholds';
import { useApp } from '@/context/AppContext';
import { useMonitorData } from '@/hooks/useMonitorData';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoRow,
  KpiCard,
  PersonaChip,
  ProgressRing,
  SectionTitle,
  SourceBadge,
} from '@/components/ui';
import { SeverityDonut } from '@/components/charts';
import { AlertPanel } from '@/components/AlertPanel';
import { DriftChart } from '@/components/DriftChart';
import { FeatureDriftTable } from '@/components/FeatureDrift';
import { MetricsChart } from '@/components/MetricsChart';

const PERSONA_CARDS = [
  {
    person: 'Pessoa 1' as const,
    role: 'ML & Dados',
    href: '/modelo',
    icon: Cpu,
    accent: 'brand' as const,
    items: PERSONAS.p1.responsibilities,
    cta: 'Abrir modelo e simulador',
  },
  {
    person: 'Pessoa 2' as const,
    role: 'Drift & Estatística',
    href: '/drift',
    icon: Activity,
    accent: 'info' as const,
    items: PERSONAS.p2.responsibilities,
    cta: 'Abrir laboratório de drift',
  },
  {
    person: 'Pessoa 3' as const,
    role: 'Software & Fullstack',
    href: '/sistema',
    icon: Layers,
    accent: 'warn' as const,
    items: PERSONAS.p3.responsibilities,
    cta: 'Abrir sistema e API',
  },
];

function severityLabel(level: DriftLevel): string {
  return DRIFT_LEVEL_META[level].label;
}

function pipelineStatus(level: DriftLevel): string {
  return level === 'none' ? 'estável' : level === 'low' ? 'leve' : level === 'moderate' ? 'moderado' : 'forte';
}

export function Dashboard({ data }: { data: NonNullable<ReturnType<typeof useMonitorData>> }) {
  const router = useRouter();
  const { thresholds, triggerRetrain, experimentsSource, selectedExperimentId } = useApp();

  const firstPerformance = data.performance[0];
  const lastPerformance = data.performance[data.performance.length - 1];
  const prevPerformance = data.performance[data.performance.length - 2];
  const f1Values = data.performance.map((point) => point.f1);
  const aucValues = data.performance.map((point) => point.aucRoc);
  const psiValues = data.driftTimeline.map((point) => point.psi);

  const driftedRows = data.features.filter((row) => row.isDrift);
  const criticalRows = data.features.filter((row) => row.severity === 'critical');
  const activeAlerts = data.alerts.filter((alert) => !alert.isResolved);
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === 'critical');
  const topFeatures = [...data.features].sort((a, b) => b.driftScore - a.driftScore).slice(0, 6);

  const severityCounts = useMemo<Record<Severity, number>>(() => {
    return data.features.reduce<Record<Severity, number>>(
      (acc, row) => {
        acc[row.severity] += 1;
        return acc;
      },
      { none: 0, warning: 0, critical: 0 },
    );
  }, [data.features]);

  const avgPsi =
    data.features.length > 0
      ? data.features.reduce((sum, row) => sum + (row.psi ?? 0), 0) / data.features.length
      : 0;

  const f1Delta =
    lastPerformance && prevPerformance ? lastPerformance.f1 - prevPerformance.f1 : undefined;
  const recallDelta =
    lastPerformance && prevPerformance
      ? lastPerformance.recall - prevPerformance.recall
      : undefined;

  const recovery = data.retrainRecords.filter((record) => record.status === 'completed').length;

  const runRetrain = async () => {
    await triggerRetrain(
      data.experiment.id,
      criticalAlerts.length > 0 ? 'drift_critical' : 'manual',
    );
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------ */}
      {/* Banner do experimento                                  */}
      {/* ------------------------------------------------------ */}
      <Card className="relative overflow-hidden border-brand/20 bg-surface/80">
        <div className="grid-pattern pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={data.source} />
              <Badge tone="neutral" dot>
                {STATUS_META[data.experiment.status].label}
              </Badge>
              <Badge
                tone={
                  data.experiment.drift_level === 'high'
                    ? 'danger'
                    : data.experiment.drift_level === 'moderate'
                      ? 'warn'
                      : 'brand'
                }
                dot
              >
                {severityLabel(data.experiment.drift_level)}
              </Badge>
              <span className="text-2xs text-muted">
                atualizado {timeAgo(data.lastSync.toISOString())}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink lg:text-2xl">
              {data.experiment.name}
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
              {data.experiment.description ??
                'Monitoramento contínuo de drift e degradação de performance do modelo de detecção de fraude.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-muted">
              <span className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-brand" />
                <span className="mono text-ink">{data.experiment.config.scenario as string}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-info" />
                {String(data.experiment.config.windows ?? 12)} janelas ·{' '}
                {formatCompact(Number(data.experiment.config.window_size ?? 0))} registros/janela
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-[#c084fc]" />
                {data.model.version} · {data.model.modelType.split(' ')[0]}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row xl:flex-col">
            <div className="flex items-center gap-3 rounded-xl border border-line/70 bg-elevated/35 px-3 py-2.5">
              <ProgressRing
                value={lastPerformance?.f1 ?? 0}
                size={50}
                stroke={5}
                tone={criticalAlerts.length > 0 ? 'danger' : 'brand'}
                label={formatPct(lastPerformance?.f1, 0)}
              />
              <div>
                <p className="label">F1 atual</p>
                <p className="mono text-sm font-semibold text-ink">
                  {formatPct(lastPerformance?.f1, 1)}
                </p>
                <p className="text-[10px] text-muted">
                  baseline {formatPct(firstPerformance?.f1, 1)}
                </p>
              </div>
            </div>
            <Button
              variant={criticalAlerts.length > 0 ? 'primary' : 'secondary'}
              icon={Wrench}
              onClick={runRetrain}
            >
              Retreinar modelo
            </Button>
            <Button variant="outline" iconRight={ArrowRight} onClick={() => router.push('/drift')}>
              Laboratório de drift
            </Button>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------ */}
      {/* KPIs                                                   */}
      {/* ------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="F1-score"
          value={formatPct(lastPerformance?.f1, 1)}
          icon={Target}
          delta={f1Delta}
          deltaLabel={`vs. janela anterior · ${data.performance.length} janelas`}
          spark={f1Values}
          tone={f1Delta !== undefined && f1Delta < -0.01 ? 'warn' : 'brand'}
        />
        <KpiCard
          label="AUC-ROC"
          value={formatPct(lastPerformance?.aucRoc, 1)}
          icon={Gauge}
          delta={
            lastPerformance && firstPerformance
              ? lastPerformance.aucRoc - firstPerformance.aucRoc
              : undefined
          }
          deltaLabel="vs. baseline do experimento"
          spark={aucValues}
          tone="info"
        />
        <KpiCard
          label="PSI máximo"
          value={formatDecimal(data.summary.max_psi, 3)}
          icon={Activity}
          deltaLabel={`limiar crítico ${formatDecimal(thresholds.psi.critical, 2)} · média ${formatDecimal(avgPsi, 3)}`}
          hint={`limiar crítico ${formatDecimal(thresholds.psi.critical, 2)} · média ${formatDecimal(avgPsi, 3)}`}
          spark={psiValues}
          tone={data.summary.max_psi >= thresholds.psi.critical ? 'danger' : 'warn'}
        />
        <KpiCard
          label="Features em drift"
          value={`${driftedRows.length}/${data.features.length}`}
          icon={Radar}
          deltaLabel={`${criticalRows.length} críticas · ${data.features.length - driftedRows.length} estáveis`}
          hint={`${criticalRows.length} críticas · ${data.features.length - driftedRows.length} estáveis`}
          tone={criticalRows.length > 0 ? 'danger' : driftedRows.length > 0 ? 'warn' : 'brand'}
        />
      </div>

      {criticalAlerts.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div>
              <p className="text-xs font-semibold text-ink">
                {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítico
                {criticalAlerts.length > 1 ? 's' : ''} exigindo ação
              </p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                {criticalAlerts[0].message}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/drift#alertas')}>
              Investigar
            </Button>
            <Button variant="primary" size="sm" icon={Wrench} onClick={runRetrain}>
              Retreinar
            </Button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ */}
      {/* Performance + modelo                                   */}
      {/* ------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricsChart
          data={data.performance}
          className="xl:col-span-2"
          baseline={firstPerformance?.f1}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted">
              <span>
                Recall {formatPct(lastPerformance?.recall, 1)} · Precisão{' '}
                {formatPct(lastPerformance?.precision, 1)} · Acurácia{' '}
                {formatPct(lastPerformance?.accuracy, 1)}
              </span>
              <span className="flex items-center gap-1">
                <TrendingDown className={cx('h-3 w-3', (recallDelta ?? 0) < 0 ? 'text-danger' : 'text-brand')} />
                {recallDelta !== undefined
                  ? `${(recallDelta * 100).toFixed(1)} p.p. de recall vs. janela anterior`
                  : 'série de performance'}
              </span>
            </div>
          }
        />

        <Card className="flex flex-col">
          <CardHeader
            icon={Cpu}
            title="Modelo ativo"
            description="Artefato XGBoost em produção"
            actions={
              <Badge tone={data.model.isActive ? 'brand' : 'neutral'} dot>
                {data.model.isActive ? 'ativo' : 'inativo'}
              </Badge>
            }
          />
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-elevated/35 px-3 py-2.5">
            <div>
              <p className="mono text-base font-semibold leading-none text-ink">
                {data.model.version}
              </p>
              <p className="mt-1 text-[10px] text-muted">{data.model.modelType}</p>
            </div>
            <ProgressRing
              value={data.model.trainingMetrics.f1}
              size={48}
              stroke={5}
              tone="brand"
              label={formatPct(data.model.trainingMetrics.f1, 0)}
            />
          </div>

          <div className="mt-3 space-y-0.5">
            <InfoRow label="Dataset" value={data.model.dataset} />
            <InfoRow label="Amostras" value={formatCompact(data.model.samples)} mono />
            <InfoRow label="Features" value={String(data.model.features)} mono />
            <InfoRow
              label="Taxa de fraude"
              value={formatPct(data.model.fraudRate, 2)}
              mono
            />
            <InfoRow
              label="Treinado em"
              value={formatDateTime(data.model.trainedAt)}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['Acurácia', data.model.trainingMetrics.accuracy],
              ['PR-AUC', data.model.trainingMetrics.prAuc],
              ['AUC-ROC', data.model.trainingMetrics.aucRoc],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-line/60 bg-elevated/30 px-2 py-1.5"
              >
                <p className="text-[9px] font-medium text-muted">{label}</p>
                <p className="mono mt-0.5 text-xs font-semibold text-ink">
                  {formatPct(value as number, 1)}
                </p>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-auto pt-0"
            iconRight={ArrowRight}
            onClick={() => router.push('/modelo')}
          >
            Ver modelo e simulador
          </Button>
        </Card>
      </div>

      {/* ------------------------------------------------------ */}
      {/* Drift + alertas                                        */}
      {/* ------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DriftChart data={data.driftTimeline} thresholds={thresholds} className="xl:col-span-2" />
        <AlertPanel alerts={data.alerts} limit={3} className="xl:col-span-1" />
      </div>

      {/* ------------------------------------------------------ */}
      {/* Features + resumo                                      */}
      {/* ------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-3">
        <FeatureDriftTable
          rows={topFeatures}
          thresholds={thresholds}
          className="xl:col-span-2"
          compact
          onSelect={() => router.push('/drift#features')}
        />
        <Card>
          <CardHeader
            icon={GitBranch}
            title="Resumo da janela"
            description="Distribuição de severidade e máximos por método"
          />
          <div className="mt-2">
            <SeverityDonut counts={severityCounts} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['none', 'warning', 'critical'] as Severity[]).map((severity) => (
              <div
                key={severity}
                className="flex items-center justify-between rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-1.5"
              >
                <span className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className={cx('h-1.5 w-1.5 rounded-full', SEVERITY_META[severity].dot)} />
                  {SEVERITY_META[severity].label}
                </span>
                <span className="mono text-xs font-semibold text-ink">
                  {severityCounts[severity]}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-1.5">
              <span className="text-[10px] text-muted">Alertas ativos</span>
              <span className="mono text-xs font-semibold text-ink">{activeAlerts.length}</span>
            </div>
          </div>
          <div className="mt-3 space-y-0.5 border-t border-line/60 pt-2">
            <InfoRow label="Máx. PSI" value={formatDecimal(data.summary.max_psi, 3)} mono />
            <InfoRow label="Máx. KS" value={formatDecimal(data.summary.max_ks, 3)} mono />
            <InfoRow label="Máx. JS" value={formatDecimal(data.summary.max_js, 3)} mono />
            <InfoRow
              label="Máx. W₁ norm."
              value={formatDecimal(data.summary.max_wasserstein, 3)}
              mono
            />
            <InfoRow
              label="Última janela"
              value={formatDateTime(data.summary.last_window_end)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(['psi', 'ks', 'js', 'wasserstein'] as const).map((key) => (
              <Badge key={key} tone="neutral" className="!text-[9px]">
                {METHOD_META[key].short} ≥ {formatDecimal(thresholds[key].critical, 2)}
              </Badge>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            iconRight={ArrowRight}
            onClick={() => router.push('/drift#features')}
          >
            Detalhar todas as features
          </Button>
        </Card>
      </div>

      {/* ------------------------------------------------------ */}
      {/* Pipeline E1–E4                                         */}
      {/* ------------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={FlaskConical}
          title="Pipeline experimental E1–E4"
          description="Do baseline à recuperação por retreinamento — cada etapa alimenta o dashboard."
          actions={
            <Button
              variant="ghost"
              size="sm"
              iconRight={ArrowRight}
              onClick={() => router.push('/experimentos')}
            >
              Experimentos
            </Button>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              id: 'E1',
              title: 'Baseline',
              subtitle: 'Controle sem drift',
              status: 'concluído',
              tone: 'brand' as const,
              icon: CheckCircle2,
              value: formatPct(
                SCENARIO_PERFORMANCE.find((entry) => entry.level === 'none')?.f1 ?? 0,
                1,
              ),
              hint: 'F1 de referência',
            },
            {
              id: 'E2',
              title: 'Injeção de drift',
              subtitle: 'Deslocamento + escala',
              status: pipelineStatus(data.experiment.drift_level),
              tone:
                data.experiment.drift_level === 'high'
                  ? ('danger' as const)
                  : data.experiment.drift_level === 'moderate'
                    ? ('warn' as const)
                    : ('brand' as const),
              icon: Activity,
              value: `${formatDecimal(avgPsi, 2)}`,
              hint: 'PSI médio atual',
            },
            {
              id: 'E3',
              title: 'Comparação de métodos',
              subtitle: `${E3_DATA.repetitions} repetições`,
              status: 'concluído',
              tone: 'info' as const,
              icon: GitBranch,
              value: formatDecimal(E3_DATA.methods[0]?.auc ?? 0, 3),
              hint: `AUC · ${E3_DATA.methods[0]?.label ?? 'Wasserstein'}`,
            },
            {
              id: 'E4',
              title: 'Retreinamento',
              subtitle: 'Recuperação orientada',
              status: recovery > 0 ? 'ativo' : 'aguardando',
              tone: 'warn' as const,
              icon: Wrench,
              value: recovery > 0 ? `${recovery} ciclos` : '—',
              hint: 'histórico registrado',
            },
          ].map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className="relative rounded-xl border border-line/70 bg-elevated/30 p-3"
              >
                {index < 3 ? (
                  <ArrowRight className="absolute -right-[13px] top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-line xl:block" />
                ) : null}
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="mono grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-[10px] font-semibold text-brand">
                      {step.id}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-ink">{step.title}</span>
                      <span className="block text-[10px] text-muted">{step.subtitle}</span>
                    </span>
                  </span>
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="mono text-sm font-semibold text-ink">{step.value}</p>
                    <p className="text-[10px] text-muted">{step.hint}</p>
                  </div>
                  <Badge tone={step.tone} dot>
                    {step.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ------------------------------------------------------ */}
      {/* Personas                                               */}
      {/* ------------------------------------------------------ */}
      <div>
        <SectionTitle
          title="Entregas por frente de trabalho"
          description="Cada visão detalha as responsabilidades descritas no documento da plataforma."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {PERSONA_CARDS.map((persona) => {
            const Icon = persona.icon;
            return (
              <Link key={persona.person} href={persona.href}>
                <Card interactive className="group h-full">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cx(
                        'grid h-9 w-9 place-items-center rounded-lg border',
                        persona.accent === 'brand'
                          ? 'border-brand/25 bg-brand/10 text-brand'
                          : persona.accent === 'info'
                            ? 'border-info/25 bg-info/10 text-info'
                            : 'border-warn/25 bg-warn/10 text-warn',
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <PersonaChip person={persona.person} compact />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{persona.role}</h3>
                  <ul className="mt-2 space-y-1">
                    {persona.items.slice(0, 2).map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-1.5 text-2xs leading-relaxed text-muted"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
                    <span className="text-2xs font-medium text-brand">{persona.cta}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {experimentsSource === 'demo' && selectedExperimentId === data.experiment.id ? (
        <div className="flex items-center gap-2 rounded-lg border border-line/70 bg-elevated/25 px-3 py-2 text-[10px] text-muted">
          <BellRing className="h-3.5 w-3.5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            Esta visão combina o experimento selecionado com dados simulados determinísticos.
            Conecte a API em Configurações para substituir as séries pelos dados persistidos.
          </span>
          <Link href="/configuracoes" className="shrink-0 font-semibold text-brand hover:underline">
            Conectar API
          </Link>
        </div>
      ) : null}
    </div>
  );
}
