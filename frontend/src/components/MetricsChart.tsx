'use client';

import React from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus } from 'lucide-react';
import { PerformancePoint } from '@/types';
import { cx, formatPct } from '@/lib/utils';
import { METRIC_COLORS, METRIC_LABELS, PerformanceChart } from '@/components/charts';
import { Badge, Card, CardHeader } from '@/components/ui';

type MetricKey = 'f1' | 'precision' | 'recall' | 'aucRoc' | 'accuracy';

const DEFAULT_METRICS: MetricKey[] = ['f1', 'precision', 'recall', 'aucRoc'];

export interface MetricsChartProps {
  data: PerformancePoint[];
  metrics?: MetricKey[];
  title?: string;
  description?: string;
  height?: number;
  baseline?: number;
  showLegend?: boolean;
  actions?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

/**
 * Wrapper de apresentação para o gráfico de performance exigido pelo PDF.
 * Mantém a leitura executiva (último valor + variação) acima do gráfico.
 */
export function MetricsChart({
  data,
  metrics = DEFAULT_METRICS,
  title = 'Performance ao longo das janelas',
  description = 'F1, precisão, recall e AUC-ROC por janela semanal de monitoramento.',
  height = 280,
  baseline,
  showLegend = true,
  actions,
  className,
  footer,
}: MetricsChartProps) {
  const last = data[data.length - 1];
  const first = data[0];

  return (
    <Card className={cx('flex flex-col', className)}>
      <CardHeader
        icon={BarChart3}
        title={title}
        description={description}
        actions={
          actions ?? (
            <Badge tone="brand" dot>
              {data.length} janelas
            </Badge>
          )
        }
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {metrics.map((metric) => {
          const value = last?.[metric];
          const initial = first?.[metric];
          const delta =
            typeof value === 'number' && typeof initial === 'number'
              ? value - initial
              : undefined;
          const Icon =
            delta === undefined || Math.abs(delta) < 0.0005
              ? Minus
              : delta > 0
                ? ArrowUpRight
                : ArrowDownRight;
          return (
            <div
              key={metric}
              className="min-w-[132px] flex-1 rounded-lg border border-line/70 bg-elevated/40 px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: METRIC_COLORS[metric] }}
                />
                <span className="text-[10px] font-medium text-muted">
                  {METRIC_LABELS[metric]}
                </span>
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="mono text-base font-semibold leading-none text-ink">
                  {formatPct(value, 1)}
                </span>
                {delta !== undefined ? (
                  <span
                    className={cx(
                      'mono flex items-center gap-0.5 text-[10px] font-semibold',
                      Math.abs(delta) < 0.0005
                        ? 'text-muted'
                        : delta > 0
                          ? 'text-brand'
                          : 'text-danger',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {Math.abs(delta * 100).toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <PerformanceChart
          data={data}
          metrics={metrics}
          height={height}
          showLegend={showLegend}
          baseline={baseline}
        />
      </div>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
}

export function MetricDelta({
  value,
  invert = false,
}: {
  value: number;
  invert?: boolean;
}) {
  const positive = invert ? value < 0 : value > 0;
  return (
    <span
      className={cx(
        'mono text-2xs font-semibold',
        Math.abs(value) < 0.0005
          ? 'text-muted'
          : positive
            ? 'text-brand'
            : 'text-danger',
      )}
    >
      {value > 0 ? '+' : ''}
      {(value * 100).toFixed(1)} p.p.
    </span>
  );
}
