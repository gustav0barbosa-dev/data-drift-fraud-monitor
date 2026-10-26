'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  StepForward,
} from 'lucide-react';
import { DriftLevel, Experiment, SimulatorWindow } from '@/types';
import {
  buildPerformanceTimeline,
  buildConfusionMatrix,
  makeSimulatedWindow,
} from '@/data/mock';
import { DRIFT_LEVELS } from '@/data/thresholds';
import { DRIFT_LEVEL_META, cx, formatCompact, formatPct } from '@/lib/utils';
import { PerformanceChart } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoRow,
  Meter,
  SectionTitle,
} from '@/components/ui';

const MAX_WINDOWS = 12;

function levelTone(level: DriftLevel): 'brand' | 'info' | 'warn' | 'danger' {
  return level === 'none'
    ? 'brand'
    : level === 'low'
      ? 'info'
      : level === 'moderate'
        ? 'warn'
        : 'danger';
}

export function SimulatorPanel({ experiment }: { experiment: Experiment }) {
  const base = useMemo(() => buildPerformanceTimeline(experiment), [experiment]);
  const [windows, setWindows] = useState<SimulatorWindow[]>(base);
  const [level, setLevel] = useState<DriftLevel>(experiment.drift_level);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    setWindows(base);
    setLevel(experiment.drift_level);
    setAuto(false);
  }, [base, experiment.drift_level]);

  const advance = useCallback(() => {
    setWindows((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      const nextIndex = current.length;
      const next = makeSimulatedWindow(experiment, previous, level, nextIndex);
      return [...current, next].slice(-MAX_WINDOWS * 2);
    });
  }, [experiment, level]);

  useEffect(() => {
    if (!auto) return undefined;
    const interval = window.setInterval(advance, 2400);
    return () => window.clearInterval(interval);
  }, [auto, advance]);

  const reset = () => {
    setWindows(base);
    setAuto(false);
  };

  const current = windows[windows.length - 1] ?? base[base.length - 1];
  const previous = windows[windows.length - 2];
  const confusion = current ? buildConfusionMatrix(current) : null;

  const deltaF1 = current && previous ? current.f1 - previous.f1 : 0;
  const windowCount = windows.length;

  return (
    <Card>
      <CardHeader
        icon={Activity}
        title="Simulador temporal"
        description="Injete drift e avance janelas para observar a degradação do classificador em tempo real."
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone={auto ? 'brand' : 'neutral'} dot={auto}>
              {auto ? 'executando' : 'pausado'}
            </Badge>
            <Button variant="outline" size="sm" icon={RotateCcw} onClick={reset}>
              Resetar
            </Button>
            <Button
              variant={auto ? 'secondary' : 'primary'}
              size="sm"
              icon={auto ? Pause : Play}
              onClick={() => setAuto((value) => !value)}
            >
              {auto ? 'Pausar' : 'Auto'}
            </Button>
          </div>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium text-muted">Cenário:</span>
        {DRIFT_LEVELS.map((item) => {
          const meta = DRIFT_LEVEL_META[item];
          const active = level === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setLevel(item)}
              className={cx(
                'rounded-full border px-2.5 py-1 text-[10px] font-medium transition',
                active
                  ? item === 'high'
                    ? 'border-danger/35 bg-danger/10 text-danger'
                    : item === 'moderate'
                      ? 'border-warn/35 bg-warn/10 text-warn'
                      : 'border-brand/35 bg-brand/10 text-brand'
                  : 'border-line bg-elevated/40 text-muted hover:text-ink',
              )}
              title={meta.description}
            >
              {meta.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-muted">
          intensidade <span className="mono text-ink">{DRIFT_LEVEL_META[level].intensity.toFixed(2)}</span>
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionTitle
              title={`Série simulada · ${windowCount} janelas`}
              description="Precisão, recall, F1 e AUC por janela"
              className="mb-0"
            />
            <Button variant="secondary" size="sm" icon={StepForward} onClick={advance}>
              Avançar janela
            </Button>
          </div>
          <PerformanceChart
            data={windows}
            metrics={['f1', 'precision', 'recall', 'aucRoc']}
            height={280}
          />
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-line/70 bg-elevated/35 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="label">Janela atual</span>
              <Badge tone={levelTone(current?.driftLevel ?? level)} dot>
                {DRIFT_LEVEL_META[current?.driftLevel ?? level].label}
              </Badge>
            </div>
            <p className="mono mt-2 text-lg font-semibold text-ink">
              {current?.label ?? '—'}
            </p>
            <p className="text-[10px] text-muted">
              {current
                ? `${formatCompact(current.totalPredictions)} predições · ${formatPct(current.driftIntensity, 0)} do cenário`
                : 'sem dados'}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                ['F1', current?.f1 ?? 0, 'brand'],
                ['Recall', current?.recall ?? 0, 'warn'],
                ['Precisão', current?.precision ?? 0, 'info'],
              ].map(([label, value, tone]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-line/60 bg-surface/60 px-2 py-1.5 text-center"
                >
                  <p className="text-[9px] text-muted">{label}</p>
                  <p
                    className={cx(
                      'mono mt-0.5 text-xs font-semibold',
                      tone === 'brand' ? 'text-brand' : tone === 'warn' ? 'text-warn' : 'text-info',
                    )}
                  >
                    {formatPct(value as number, 1)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-muted">Variação de F1</span>
              <span
                className={cx(
                  'mono font-semibold',
                  deltaF1 < 0 ? 'text-danger' : deltaF1 > 0 ? 'text-brand' : 'text-muted',
                )}
              >
                {deltaF1 > 0 ? '+' : ''}
                {(deltaF1 * 100).toFixed(2)} p.p.
              </span>
            </div>
          </div>

          {confusion ? (
            <div className="rounded-xl border border-line/70 bg-elevated/35 p-3">
              <span className="label">Matriz de confusão</span>
              <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-1 text-center text-[10px]">
                <span />
                <span className="text-muted">Prev. fraude</span>
                <span className="text-muted">Prev. legítima</span>
                <span className="text-left text-muted">Fraude</span>
                <span className="mono rounded border border-brand/25 bg-brand/10 py-1.5 font-semibold text-brand">
                  {formatCompact(confusion.tp)}
                </span>
                <span className="mono rounded border border-danger/25 bg-danger/10 py-1.5 font-semibold text-danger">
                  {formatCompact(confusion.fn)}
                </span>
                <span className="text-left text-muted">Legítima</span>
                <span className="mono rounded border border-warn/25 bg-warn/10 py-1.5 font-semibold text-warn">
                  {formatCompact(confusion.fp)}
                </span>
                <span className="mono rounded border border-line bg-surface/60 py-1.5 font-semibold text-ink">
                  {formatCompact(confusion.tn)}
                </span>
              </div>
              <div className="mt-2 space-y-0.5">
                <InfoRow label="Total" value={formatCompact(confusion.total)} mono />
                <InfoRow
                  label="Falsos negativos"
                  value={formatPct(confusion.fn / Math.max(confusion.total, 1), 2)}
                  mono
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-line/70 bg-elevated/35 p-3">
            <span className="label">Cenário selecionado</span>
            <p className="mt-1 text-xs font-medium text-ink">
              {DRIFT_LEVEL_META[level].label}
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
              {DRIFT_LEVEL_META[level].description}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-muted">Intensidade acumulada</span>
              <span className="mono text-ink">
                {formatPct(current?.driftIntensity ?? 0, 0)}
              </span>
            </div>
            <Meter
              value={current?.driftIntensity ?? 0}
              max={1}
              tone={levelTone(level)}
              className="mt-1"
              thresholds={[
                { value: 0.3, tone: 'warn', label: 'atenção' },
                { value: 0.65, tone: 'danger', label: 'crítico' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-[10px] leading-relaxed text-muted">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          O simulador roda inteiramente no navegador com gerador determinístico. Ele reproduz a
          mecânica do script <span className="mono text-ink">backend/ml/simulator.py</span>: cada
          janela aplica ruído, deslocamento e mudança de escala antes do scoring.
        </span>
      </div>
    </Card>
  );
}
