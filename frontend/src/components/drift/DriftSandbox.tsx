'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Beaker,
  CheckCircle2,
  CloudOff,
  FlaskConical,
  Info,
  Play,
  RotateCcw,
  Sparkles,
  Wifi,
} from 'lucide-react';
import {
  DistributionPoint,
  DriftThresholds,
  FeatureDriftApiResponse,
  FeatureDriftRow,
  MethodDetail,
  MethodKey,
} from '@/types';
import {
  SANDBOX_CURRENT,
  SANDBOX_REFERENCE,
  SANDBOX_STABLE,
} from '@/data/mock';
import { calculateFeatureDrift, parseValues, standardDeviation } from '@/lib/drift';
import { METHOD_META, cx, formatDecimal, formatNumber, formatPct } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { api, apiErrorMessage } from '@/services/api';
import { DistributionChart } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoRow,
  Input,
  Meter,
  SeverityBadge,
  Textarea,
  Toggle,
} from '@/components/ui';

const METHOD_ORDER: MethodKey[] = ['psi', 'ks', 'js', 'wasserstein'];

const PRESETS = [
  { id: 'strong', label: 'Drift forte', current: SANDBOX_CURRENT, categorical: false },
  { id: 'stable', label: 'Estável', current: SANDBOX_STABLE, categorical: false },
  {
    id: 'categorical',
    label: 'Categórico',
    current: [
      0, 1, 2, 0, 1, 1, 2, 0, 3, 1, 2, 0, 1, 4, 2, 0, 1, 2, 3, 1, 0, 2, 1, 4,
    ],
    categorical: true,
  },
];

function rowFromApi(
  response: FeatureDriftApiResponse,
  thresholds: DriftThresholds,
  fallbackName: string,
): FeatureDriftRow {
  const methods = {} as Record<MethodKey, MethodDetail>;
  for (const key of METHOD_ORDER) {
    const raw = response.methods[key];
    methods[key] = raw
      ? {
          available: raw.available,
          value: raw.value,
          statistic: raw.statistic,
          threshold: raw.threshold,
          warningThreshold: raw.warning_threshold,
          direction: raw.direction,
          severity: raw.severity,
          isDrift: raw.is_drift,
          ...(raw.reason ? { reason: String(raw.reason) } : {}),
        }
      : {
          available: false,
          value: null,
          statistic: null,
          threshold: thresholds[key].critical,
          warningThreshold: thresholds[key].warning,
          direction: thresholds[key].direction,
          severity: 'none',
          isDrift: false,
          reason: 'Método não retornado pela API.',
        };
  }

  return {
    name: response.feature_name ?? fallbackName,
    type: response.categorical ? 'categorical' : 'numeric',
    nReference: response.n_reference,
    nCurrent: response.n_current,
    psi: response.psi,
    ksStat: response.ks_stat,
    ksPvalue: response.ks_pvalue,
    js: response.js,
    wasserstein: response.wasserstein,
    wassersteinNormalized: response.wasserstein_normalized,
    driftScore: response.drift_score,
    severity: response.severity,
    isDrift: response.is_drift,
    insufficientData: response.insufficient_data,
    methods,
    warnings: response.warnings ?? [],
  };
}

function buildSandboxDistribution(
  reference: number[],
  current: number[],
  bins = 14,
): DistributionPoint[] {
  if (reference.length < 2 || current.length < 2) return [];
  const all = [...reference, ...current];
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max <= min) {
    return [
      {
        label: formatNumber(min, 1),
        reference: reference.length,
        current: current.length,
      },
    ];
  }
  const width = (max - min) / bins;
  const refCounts = new Array(bins).fill(0);
  const curCounts = new Array(bins).fill(0);
  for (const value of reference) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    refCounts[index] += 1;
  }
  for (const value of current) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    curCounts[index] += 1;
  }
  return refCounts.map((count, index) => ({
    label: formatNumber(min + width * index, 1),
    reference: count,
    current: curCounts[index],
  }));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function DriftSandbox() {
  const { thresholds, online, settings, pushToast } = useApp();
  const [referenceInput, setReferenceInput] = useState(
    SANDBOX_REFERENCE.join(', '),
  );
  const [currentInput, setCurrentInput] = useState(SANDBOX_CURRENT.join(', '));
  const [featureName, setFeatureName] = useState('sandbox_amount');
  const [categorical, setCategorical] = useState(false);
  const [preferApi, setPreferApi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FeatureDriftRow | null>(null);
  const [origin, setOrigin] = useState<'local' | 'api' | null>(null);

  const reference = useMemo(() => parseValues(referenceInput), [referenceInput]);
  const current = useMemo(() => parseValues(currentInput), [currentInput]);

  const histogram = useMemo(
    () => buildSandboxDistribution(reference, current),
    [reference, current],
  );

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setReferenceInput(
      (preset.categorical
        ? [0, 1, 2, 0, 1, 2, 0, 1, 2, 3, 0, 1, 2, 0, 1, 2, 4, 0, 1, 2, 0, 1, 2, 3]
        : SANDBOX_REFERENCE
      ).join(', '),
    );
    setCurrentInput(preset.current.join(', '));
    setCategorical(preset.categorical);
    setFeatureName(preset.categorical ? 'transaction_type' : 'sandbox_amount');
    setResult(null);
    setOrigin(null);
  };

  const runDetection = async () => {
    if (reference.length < 2 || current.length < 2) {
      pushToast({
        tone: 'warning',
        title: 'Amostras insuficientes',
        description: 'Informe pelo menos dois valores numéricos em cada janela.',
      });
      return;
    }

    setLoading(true);
    let next = calculateFeatureDrift(reference, current, thresholds, {
      featureName: featureName || 'sandbox_feature',
      categorical,
    });
    let nextOrigin: 'local' | 'api' = 'local';

    if (preferApi && online === true && !settings.forceDemo) {
      try {
        const response = await api.drift.detectFeature({
          feature_name: featureName || 'sandbox_feature',
          reference,
          current,
          categorical,
          methods: ['psi', 'ks', 'js', 'wasserstein'],
          thresholds,
        });
        next = rowFromApi(response, thresholds, featureName);
        nextOrigin = 'api';
      } catch (error) {
        pushToast({
          tone: 'warning',
          title: 'Cálculo local utilizado',
          description: apiErrorMessage(error),
        });
      }
    }

    setResult(next);
    setOrigin(nextOrigin);
    setLoading(false);
  };

  const reset = () => {
    setReferenceInput(SANDBOX_REFERENCE.join(', '));
    setCurrentInput(SANDBOX_CURRENT.join(', '));
    setFeatureName('sandbox_amount');
    setCategorical(false);
    setResult(null);
    setOrigin(null);
  };

  return (
    <Card>
      <CardHeader
        icon={FlaskConical}
        title="Sandbox de detecção"
        description="Cole duas amostras e compare PSI, KS, JS e Wasserstein com os limiares ativos."
        actions={
          <Badge tone={origin === 'api' ? 'brand' : origin === 'local' ? 'info' : 'neutral'} dot>
            {origin === 'api' ? 'API' : origin === 'local' ? 'cálculo local' : 'pronto'}
          </Badge>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium text-muted">Exemplos:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-line bg-elevated/40 px-2.5 py-1 text-[10px] font-medium text-muted transition hover:border-brand/35 hover:text-ink"
          >
            {preset.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} className="ml-auto">
          Limpar
        </Button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Textarea
          label="Amostra de referência"
          value={referenceInput}
          onChange={(event) => setReferenceInput(event.target.value)}
          rows={4}
          className="mono text-[11px]"
          hint={`${reference.length} valores numéricos detectados`}
        />
        <Textarea
          label="Amostra da janela atual"
          value={currentInput}
          onChange={(event) => setCurrentInput(event.target.value)}
          rows={4}
          className="mono text-[11px]"
          hint={`${current.length} valores numéricos detectados`}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <Input
          label="Nome da feature"
          value={featureName}
          onChange={(event) => setFeatureName(event.target.value)}
          placeholder="amount"
          className="h-9 text-xs mono"
        />
        <div className="rounded-lg border border-line/60 bg-elevated/25 px-3 py-1.5">
          <Toggle
            checked={categorical}
            onChange={setCategorical}
            label="Categórica"
            description="Usa apenas PSI e JS"
          />
        </div>
        <div className="rounded-lg border border-line/60 bg-elevated/25 px-3 py-1.5">
          <Toggle
            checked={preferApi}
            onChange={setPreferApi}
            label="Preferir API"
            description={online ? 'tenta detect/feature' : 'API offline'}
            disabled={online !== true}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Play} onClick={runDetection} loading={loading}>
          Calcular drift
        </Button>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          {online === true ? (
            <Wifi className="h-3 w-3 text-brand" />
          ) : (
            <CloudOff className="h-3 w-3 text-warn" />
          )}
          {online === true
            ? `detecção via ${preferApi ? 'API + fallback local' : 'métodos locais'}`
            : 'métodos estatísticos executados no navegador'}
        </span>
        <span className="ml-auto text-[10px] text-muted">
          bins PSI {thresholds.psi_bins} · bins JS {thresholds.js_bins} · amostra mín. {thresholds.min_samples}
        </span>
      </div>

      {result ? (
        <div className="mt-4 animate-fade-in space-y-3 border-t border-line/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={result.severity} />
            <Badge tone={result.isDrift ? 'danger' : 'brand'} dot>
              {result.isDrift ? 'drift confirmado' : 'sem drift'}
            </Badge>
            <Badge tone={origin === 'api' ? 'brand' : 'info'}>
              {origin === 'api' ? 'resultado da API' : 'resultado local'}
            </Badge>
            <span className="mono text-[10px] text-muted">
              score {formatDecimal(result.driftScore, 3)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHOD_ORDER.map((method) => {
              const detail = result.methods[method];
              const meta = METHOD_META[method];
              return (
                <div
                  key={method}
                  className="rounded-xl border border-line/70 bg-elevated/25 px-2.5 py-2"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: meta.color }}
                    />
                    <span className="text-[9px] font-medium text-muted">{meta.short}</span>
                  </div>
                  <p
                    className={cx(
                      'mono mt-1 text-base font-semibold leading-none',
                      detail.severity === 'critical'
                        ? 'text-danger'
                        : detail.severity === 'warning'
                          ? 'text-warn'
                          : 'text-ink',
                    )}
                  >
                    {detail.available
                      ? method === 'ks'
                        ? formatDecimal(detail.statistic, 3)
                        : formatDecimal(detail.value, 3)
                      : '—'}
                  </p>
                  <p className="mt-1 text-[9px] text-muted">
                    {detail.available
                      ? method === 'ks'
                        ? `p = ${formatDecimal(detail.value, 4)}`
                        : `${detail.direction === 'above' ? '≥' : '≤'} ${formatDecimal(
                            detail.threshold,
                            2,
                          )}`
                      : 'não aplicável'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line/70 bg-elevated/25 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Métodos</span>
                <span className="text-[9px] text-muted">limiares ativos</span>
              </div>
              <div className="space-y-2">
                {METHOD_ORDER.map((method) => {
                  const detail = result.methods[method];
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1.5 text-muted">
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{ background: METHOD_META[method].color }}
                          />
                          {METHOD_META[method].short}
                        </span>
                        <span className="mono text-ink">
                          {detail.available
                            ? method === 'ks'
                              ? `p ${formatDecimal(detail.value, 4)}`
                              : formatDecimal(detail.value, 3)
                            : '—'}
                        </span>
                      </div>
                      <Meter
                        value={
                          detail.value === null
                            ? 0
                            : method === 'ks'
                              ? Math.min(1, Math.max(0, 1 - detail.value / 0.2))
                              : Math.min(1.2, detail.value / Math.max(detail.threshold ?? 1, 1e-6))
                        }
                        max={1.2}
                        tone={
                          detail.severity === 'critical'
                            ? 'danger'
                            : detail.severity === 'warning'
                              ? 'warn'
                              : 'brand'
                        }
                        height="h-1"
                        className="mt-1"
                        thresholds={[{ value: 1 / 1.2, tone: 'danger' }]}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-line/60 pt-2">
                <InfoRow label="Referência" value={result.nReference.toLocaleString('pt-BR')} mono />
                <InfoRow label="Atual" value={result.nCurrent.toLocaleString('pt-BR')} mono />
                <InfoRow label="W₁ bruto" value={formatDecimal(result.wasserstein, 2)} mono />
                <InfoRow label="Tipo" value={result.type} />
              </div>
            </div>

            <div className="rounded-xl border border-line/70 bg-elevated/25 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Distribuições</span>
                <span className="text-[9px] text-muted">histograma das amostras</span>
              </div>
              {histogram.length > 1 ? (
                <DistributionChart data={histogram} height={190} />
              ) : (
                <EmptyState
                  icon={ArrowRightLeft}
                  title="Amostras muito curtas"
                  description="Informe mais valores para visualizar o histograma."
                  className="py-6"
                />
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
                  <p className="text-muted">Média ref.</p>
                  <p className="mono mt-0.5 text-ink">{formatDecimal(mean(reference), 2)}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
                  <p className="text-muted">Média atual</p>
                  <p className="mono mt-0.5 text-ink">{formatDecimal(mean(current), 2)}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
                  <p className="text-muted">Desvio ref.</p>
                  <p className="mono mt-0.5 text-ink">
                    {formatDecimal(standardDeviation(reference), 2)}
                  </p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
                  <p className="text-muted">Desvio atual</p>
                  <p className="mono mt-0.5 text-ink">
                    {formatDecimal(standardDeviation(current), 2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {result.warnings.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <div className="space-y-0.5">
                {result.warnings.map((warning) => (
                  <p key={warning} className="text-[10px] leading-relaxed text-muted">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-brand" />
              {result.insufficientData
                ? 'Amostra abaixo do mínimo configurado.'
                : 'Amostra suficiente para os métodos selecionados.'}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-info" />
              PSI {formatPct(result.psi ?? 0, 2)} · JS {formatPct(result.js ?? 0, 2)}
            </span>
            <span className="flex items-center gap-1">
              <Beaker className="h-3 w-3 text-warn" />
              limiar de gatilho: {thresholds.trigger_severity}
            </span>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Pronto para calcular"
          description="Use um exemplo acima ou cole suas próprias amostras. O cálculo local funciona sem backend."
          className="mt-3 rounded-xl border border-dashed border-line/80 bg-elevated/15"
        />
      )}
    </Card>
  );
}
