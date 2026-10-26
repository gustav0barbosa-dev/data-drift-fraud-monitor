'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  BarChart3,
  Clock3,
  FlaskConical,
  GitCompareArrows,
  Radar,
  Target,
  Zap,
} from 'lucide-react';
import { MethodKey } from '@/types';
import { E3_DATA, E3_INSIGHTS, E3_METHOD_COLORS } from '@/data/e3';
import { METHOD_META, cx, formatDecimal, formatPct } from '@/lib/utils';
import {
  DetectionByScenarioChart,
  LatencyChart,
} from '@/components/charts';
import {
  Badge,
  Card,
  CardHeader,
  InfoRow,
  Meter,
  Tabs,
} from '@/components/ui';

const SCENARIO_TABS = [
  { id: 'low', label: 'Drift baixo' },
  { id: 'moderate', label: 'Moderado' },
  { id: 'high', label: 'Forte' },
] as const;

const RANKING_LABELS: Record<keyof typeof E3_DATA.ranking, { label: string; icon: typeof Award; hint: string }> = {
  byAuc: { label: 'AUC', icon: Award, hint: 'capacidade de separação global' },
  bySensitivity: { label: 'Sensibilidade', icon: Target, hint: 'detecção de drift real' },
  byFalsePositiveRate: { label: 'Falso positivo', icon: Radar, hint: 'estabilidade sem drift' },
  byLatency: { label: 'Latência', icon: Zap, hint: 'tempo de execução médio' },
};

export function E3Comparison() {
  const [scenario, setScenario] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [ranking, setRanking] = useState<keyof typeof E3_DATA.ranking>('byAuc');

  const latencyData = E3_DATA.latency[scenario];
  const scenarioRow = E3_DATA.detectionByScenario.find((row) => row.scenario === scenario);
  const rankingMeta = RANKING_LABELS[ranking];
  const RankingIcon = rankingMeta.icon;

  const bestAuc = useMemo(
    () => [...E3_DATA.methods].sort((a, b) => b.auc - a.auc)[0],
    [],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={FlaskConical}
          title="E3 · comparação estatística dos métodos"
          description={`${E3_DATA.repetitions} repetições · n_ref=${E3_DATA.nReference.toLocaleString('pt-BR')} · n_cur=${E3_DATA.nCurrent.toLocaleString('pt-BR')} · seed 42`}
          actions={
            <Badge tone="brand" dot>
              resultados reais
            </Badge>
          }
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {E3_INSIGHTS.map((insight) => (
            <div
              key={insight.title}
              className="rounded-xl border border-line/70 bg-elevated/25 px-3 py-2.5"
            >
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
                {insight.title}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{insight.value}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{insight.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Método</th>
                <th className="!text-right">AUC [IC 95%]</th>
                <th className="!text-right">Sens.</th>
                <th className="!text-right">Espec.</th>
                <th className="!text-right">Precisão</th>
                <th className="!text-right">F1</th>
                <th className="!text-right">MCC</th>
                <th className="!text-right">FPR</th>
                <th className="!text-right">Latência</th>
              </tr>
            </thead>
            <tbody>
              {E3_DATA.methods.map((method) => (
                <tr key={method.key}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: E3_METHOD_COLORS[method.key] }}
                      />
                      <span className="text-xs font-medium text-ink">{method.label}</span>
                      {bestAuc && method.key === bestAuc.key ? (
                        <Badge tone="brand" className="!py-0 !text-[9px]">
                          melhor AUC
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="mono text-xs font-semibold text-ink">
                        {formatDecimal(method.auc, 4)}
                      </span>
                      <span className="mono text-[9px] text-muted">
                        [{formatDecimal(method.aucLower, 3)}; {formatDecimal(method.aucUpper, 3)}]
                      </span>
                    </div>
                  </td>
                  <td className="mono text-right text-xs">{formatPct(method.sensitivity, 1)}</td>
                  <td className="mono text-right text-xs">{formatPct(method.specificity, 1)}</td>
                  <td className="mono text-right text-xs">{formatPct(method.precision, 1)}</td>
                  <td className="mono text-right text-xs font-semibold">{formatPct(method.f1, 1)}</td>
                  <td className="mono text-right text-xs">{formatDecimal(method.mcc, 3)}</td>
                  <td className="mono text-right text-xs">{formatPct(method.falsePositiveRate, 1)}</td>
                  <td className="mono text-right text-xs">{formatDecimal(method.latencyMean, 2)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
          <span>
            Fonte: <span className="mono text-ink">backend/experiments/results/e3/e3_results.json</span>
          </span>
          <span>MCC = Matthews correlation coefficient · FPR = taxa de falso positivo</span>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={BarChart3}
            title="Detecção por cenário"
            description="Proporção declarada de detecção em cada nível de drift."
            actions={<Badge tone="info">E3</Badge>}
          />
          <div className="mt-3">
            <DetectionByScenarioChart data={E3_DATA.detectionByScenario} height={275} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {E3_DATA.detectionByScenario.map((row) => (
              <Badge key={row.scenario} tone="neutral" className="!text-[9px]">
                {row.label}: PSI {formatDecimal(row.psi, 2)} · KS {formatDecimal(row.ks, 2)}
              </Badge>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Clock3}
            title="Curva de detecção acumulada"
            description="Velocidade com que cada método detecta o drift ao longo das janelas."
            actions={
              <Tabs
                items={SCENARIO_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
                value={scenario}
                onChange={(value) => setScenario(value as typeof scenario)}
                size="sm"
              />
            }
          />
          <div className="mt-3">
            <LatencyChart data={latencyData} height={278} />
          </div>
          {scenarioRow ? (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {(['psi', 'ks', 'js', 'wasserstein'] as MethodKey[]).map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-line/60 bg-elevated/30 px-2 py-1.5 text-center"
                >
                  <p className="text-[9px] text-muted">{METHOD_META[key].short}</p>
                  <p className="mono mt-0.5 text-xs font-semibold text-ink">
                    {formatPct(scenarioRow[key], 1)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={GitCompareArrows}
            title="Concordância entre métodos"
            description="Cohen's κ, taxa de concordância e diferença de acurácia par a par."
          />
          <div className="mt-3 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Par</th>
                  <th className="!text-right">κ</th>
                  <th className="!text-right">Concordância</th>
                  <th className="!text-right">p-valor</th>
                  <th className="!text-right">Δ acurácia</th>
                </tr>
              </thead>
              <tbody>
                {E3_DATA.pairwise.map((pair) => (
                  <tr key={pair.pair}>
                    <td className="text-xs font-medium text-ink">{pair.pair}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Meter
                          value={pair.kappa}
                          max={1}
                          tone={pair.kappa > 0.8 ? 'brand' : pair.kappa > 0.6 ? 'warn' : 'danger'}
                          height="h-1"
                          className="w-14"
                        />
                        <span className="mono w-12 text-xs">{formatDecimal(pair.kappa, 3)}</span>
                      </div>
                    </td>
                    <td className="mono text-right text-xs">{formatPct(pair.agreement, 1)}</td>
                    <td className="mono text-right text-xs">
                      {pair.pValue < 0.0001 ? pair.pValue.toExponential(1) : formatDecimal(pair.pValue, 4)}
                    </td>
                    <td
                      className={cx(
                        'mono text-right text-xs',
                        pair.accuracyDiff < 0 ? 'text-danger' : 'text-brand',
                      )}
                    >
                      {pair.accuracyDiff > 0 ? '+' : ''}
                      {(pair.accuracyDiff * 100).toFixed(1)} p.p.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={RankingIcon}
            title="Ranking por critério"
            description="Ordene os métodos conforme a prioridade operacional."
            actions={<Badge tone="purple">E3</Badge>}
          />
          <div className="mt-3 flex flex-wrap gap-1">
            {(Object.keys(E3_DATA.ranking) as (keyof typeof E3_DATA.ranking)[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRanking(key)}
                className={cx(
                  'rounded-full border px-2 py-1 text-[9px] font-medium transition',
                  ranking === key
                    ? 'border-brand/35 bg-brand/10 text-brand'
                    : 'border-line bg-elevated/40 text-muted hover:text-ink',
                )}
              >
                {RANKING_LABELS[key].label}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {E3_DATA.ranking[ranking].map((methodKey, index) => {
              const method = E3_DATA.methods.find((item) => item.key === methodKey);
              if (!method) return null;
              return (
                <div
                  key={methodKey}
                  className="flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/25 px-2.5 py-2"
                >
                  <span className="mono grid h-5 w-5 place-items-center rounded border border-line bg-surface text-[9px] font-semibold text-muted">
                    {index + 1}
                  </span>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: E3_METHOD_COLORS[method.key] }}
                  />
                  <span className="min-w-0 flex-1 text-xs font-medium text-ink">
                    {method.label}
                  </span>
                  <span className="mono text-[10px] text-muted">
                    {ranking === 'byAuc'
                      ? formatDecimal(method.auc, 4)
                      : ranking === 'bySensitivity'
                        ? formatPct(method.sensitivity, 1)
                        : ranking === 'byFalsePositiveRate'
                          ? formatPct(method.falsePositiveRate, 1)
                          : `${formatDecimal(method.latencyMean, 2)} ms`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            <span>
              {rankingMeta.hint}. O dashboard usa PSI como métrica principal e os demais métodos
              como confirmação cruzada.
            </span>
          </div>
          <div className="mt-3 border-t border-line/60 pt-2">
            <InfoRow label="Repetições" value={String(E3_DATA.repetitions)} mono />
            <InfoRow
              label="Gerado em"
              value={new Date(E3_DATA.generatedAt).toLocaleDateString('pt-BR')}
            />
            <InfoRow label="Amostras" value="1.000 ref · 500 atual" mono />
          </div>
        </Card>
      </div>
    </div>
  );
}
