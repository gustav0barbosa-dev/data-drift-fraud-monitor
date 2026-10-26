'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  FlaskConical,
  Info,
  Layers,
  Signal,
} from 'lucide-react';
import { DriftThresholds, Experiment, FeatureDriftRow, MethodKey } from '@/types';
import {
  METHOD_META,
  SEVERITY_META,
  cx,
  featureLabel,
  formatDecimal,
  formatPct,
} from '@/lib/utils';
import { methodValueLabel } from '@/lib/drift';
import {
  buildCategoricalDistribution,
  buildDistribution,
} from '@/data/mock';
import { DistributionChart } from '@/components/charts';
import {
  Badge,
  Button,
  Drawer,
  InfoRow,
  Meter,
  SeverityBadge,
  Tabs,
} from '@/components/ui';

const METHOD_ORDER: MethodKey[] = ['psi', 'ks', 'js', 'wasserstein'];

function methodAuxiliary(method: MethodKey, row: FeatureDriftRow): string {
  const detail = row.methods[method];
  if (!detail.available) return detail.reason ?? 'não aplicável';
  if (method === 'ks') {
    return `D = ${formatDecimal(detail.statistic, 3)} · p-valor ${
      detail.value === null ? '—' : formatDecimal(detail.value, 4)
    }`;
  }
  if (method === 'wasserstein') {
    return `distância bruta ${formatDecimal(detail.statistic, 2)}`;
  }
  return detail.direction === 'above'
    ? `quanto maior, pior`
    : `quanto menor, pior`;
}

function methodRatio(
  method: MethodKey,
  row: FeatureDriftRow,
  thresholds: DriftThresholds,
): number {
  const detail = row.methods[method];
  if (!detail.available || detail.value === null) return 0;
  if (method === 'ks') {
    // p-valor baixo indica drift: normaliza pelo limiar de atenção.
    return Math.min(1, Math.max(0, 1 - detail.value / Math.max(thresholds.ks.warning * 2, 1e-6)));
  }
  return Math.min(1.4, detail.value / Math.max(detail.threshold ?? 1, 1e-6));
}

export function FeatureDetailDrawer({
  open,
  onClose,
  row,
  experiment,
  thresholds,
}: {
  open: boolean;
  onClose: () => void;
  row: FeatureDriftRow | null;
  experiment: Experiment;
  thresholds: DriftThresholds;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState('metodos');

  const distribution = useMemo(() => {
    if (!row) return [];
    return row.type === 'categorical'
      ? buildCategoricalDistribution(experiment.drift_level)
      : buildDistribution(row.name, experiment.drift_level, 20);
  }, [row, experiment.drift_level]);

  if (!row) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={featureLabel(row.name)}
      subtitle={`${row.name} · variável ${row.type === 'categorical' ? 'categórica' : 'numérica'}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="primary"
            icon={FlaskConical}
            onClick={() => {
              onClose();
              router.push('/drift#sandbox');
            }}
          >
            Testar no sandbox
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={row.severity} />
          <Badge tone={row.isDrift ? 'danger' : 'brand'} dot>
            {row.isDrift ? 'drift confirmado' : 'sem drift'}
          </Badge>
          <Badge tone="neutral">
            drift score <span className="mono ml-1">{formatDecimal(row.driftScore, 2)}</span>
          </Badge>
          {row.insufficientData ? <Badge tone="warn">amostra insuficiente</Badge> : null}
        </div>

        {row.warnings.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[10px] leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            <div>
              {row.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Referência', row.nReference.toLocaleString('pt-BR')],
            ['Janela atual', row.nCurrent.toLocaleString('pt-BR')],
            ['PSI', formatDecimal(row.psi, 3)],
            ['KS (D)', formatDecimal(row.ksStat, 3)],
            ['JS', formatDecimal(row.js, 3)],
            ['W₁ norm.', formatDecimal(row.wassersteinNormalized, 3)],
            ['p-valor KS', formatDecimal(row.ksPvalue, 4)],
            ['W₁ bruto', formatDecimal(row.wasserstein, 2)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-2"
            >
              <p className="text-[9px] font-medium text-muted">{label}</p>
              <p className="mono mt-1 text-xs font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div>
          <Tabs
            items={[
              { id: 'metodos', label: 'Métodos', icon: Signal },
              { id: 'distribuicao', label: 'Distribuições', icon: BarChart3 },
              { id: 'contexto', label: 'Contexto', icon: Layers },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
          />

          {tab === 'metodos' ? (
            <div className="mt-3 space-y-2">
              {METHOD_ORDER.map((method) => {
                const detail = row.methods[method];
                const meta = METHOD_META[method];
                const ratio = methodRatio(method, row, thresholds);
                const severity = detail.available ? detail.severity : 'none';
                return (
                  <div
                    key={method}
                    className="rounded-xl border border-line/70 bg-elevated/25 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: meta.color }}
                          />
                          <span className="text-xs font-semibold text-ink">{meta.short}</span>
                          <span className="text-[10px] text-muted">{meta.label}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {methodAuxiliary(method, row)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cx(
                            'mono text-sm font-semibold',
                            severity === 'critical'
                              ? 'text-danger'
                              : severity === 'warning'
                                ? 'text-warn'
                                : 'text-ink',
                          )}
                        >
                          {detail.available ? methodValueLabel(method, detail.value) : '—'}
                        </p>
                        <p className="text-[9px] text-muted">
                          limiar {detail.direction === 'below' ? '≤' : '≥'}{' '}
                          {formatDecimal(detail.threshold, 2)}
                        </p>
                      </div>
                    </div>
                    {detail.available ? (
                      <Meter
                        value={ratio}
                        max={1.4}
                        tone={
                          severity === 'critical'
                            ? 'danger'
                            : severity === 'warning'
                              ? 'warn'
                              : 'brand'
                        }
                        className="mt-2"
                        height="h-1"
                        thresholds={[
                          { value: 1 / 1.4, tone: 'danger', label: 'limiar crítico' },
                          { value: 0.6 / 1.4, tone: 'warn', label: 'atenção' },
                        ]}
                      />
                    ) : (
                      <p className="mt-2 text-[10px] text-muted">
                        {detail.reason ?? 'Método indisponível para este tipo de variável.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'distribuicao' ? (
            <div className="mt-3">
              <DistributionChart data={distribution} height={250} />
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                <span>
                  Histograma gerado a partir da distribuição simulada do experimento{' '}
                  <span className="mono text-ink">{experiment.name}</span>. Em modo API, a
                  comparação usa as janelas persistidas de referência e produção.
                </span>
              </div>
            </div>
          ) : null}

          {tab === 'contexto' ? (
            <div className="mt-3 rounded-xl border border-line/70 bg-elevated/25 px-3 py-2">
              <InfoRow label="Nome técnico" value={row.name} mono />
              <InfoRow label="Tipo" value={row.type} />
              <InfoRow label="Score de drift" value={formatDecimal(row.driftScore, 4)} mono />
              <InfoRow label="PSI crítico" value={formatDecimal(thresholds.psi.critical, 2)} mono />
              <InfoRow label="KS crítico (p)" value={formatDecimal(thresholds.ks.critical, 2)} mono />
              <InfoRow label="JS crítico" value={formatDecimal(thresholds.js.critical, 2)} mono />
              <InfoRow
                label="W₁ crítico"
                value={formatDecimal(thresholds.wasserstein.critical, 2)}
                mono
              />
              <InfoRow
                label="Gatilho de alerta"
                value={
                  <Badge tone={thresholds.trigger_severity === 'critical' ? 'danger' : 'warn'}>
                    {SEVERITY_META[thresholds.trigger_severity].label}
                  </Badge>
                }
              />
              <InfoRow label="Amostra mínima" value={String(thresholds.min_samples)} mono />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-line/60 bg-elevated/20 px-3 py-2">
          <p className="label mb-1">Leitura estatística</p>
          <p className="text-[10px] leading-relaxed text-muted">
            {row.isDrift
              ? `A feature ultrapassou pelo menos um limiar crítico. O score ${formatDecimal(
                  row.driftScore,
                  2,
                )} é ${formatPct(Math.max(0, row.driftScore - 1), 0)} acima do ponto de corte principal.`
              : 'Nenhum método atingiu o limiar de gatilho. A feature permanece dentro da faixa esperada para o cenário atual.'}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" />
            Compare com outros experimentos no seletor superior
          </span>
          <Badge tone="neutral">{experiment.drift_level}</Badge>
        </div>
      </div>
    </Drawer>
  );
}
