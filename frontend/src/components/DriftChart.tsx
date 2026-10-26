'use client';

import React from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { DriftThresholds, DriftTimelinePoint } from '@/types';
import { cx, formatDecimal } from '@/lib/utils';
import { DriftTrendChart } from '@/components/charts';
import { Badge, Card, CardHeader } from '@/components/ui';

export interface DriftChartProps {
  data: DriftTimelinePoint[];
  thresholds?: DriftThresholds;
  title?: string;
  description?: string;
  height?: number;
  actions?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

/**
 * Wrapper do gráfico de drift exigido pelo PDF. Além da série temporal,
 * apresenta o último ponto observado e a leitura dos métodos.
 */
export function DriftChart({
  data,
  thresholds,
  title = 'Evolução do drift por janela',
  description = 'PSI médio (área) e quantidade de features com drift confirmado (barras).',
  height = 250,
  actions,
  className,
  footer,
}: DriftChartProps) {
  const last = data[data.length - 1];

  return (
    <Card className={cx('flex flex-col', className)}>
      <CardHeader
        icon={Activity}
        title={title}
        description={description}
        actions={
          actions ?? (
            <Badge tone={last && last.drifted > 0 ? 'danger' : 'brand'} dot>
              {last ? `${last.drifted} em drift` : 'sem janelas'}
            </Badge>
          )
        }
      />

      {last ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              label: 'PSI médio',
              value: formatDecimal(last.psi, 3),
              tone:
                thresholds && last.psi >= thresholds.psi.critical
                  ? 'text-danger'
                  : thresholds && last.psi >= thresholds.psi.warning
                    ? 'text-warn'
                    : 'text-ink',
            },
            {
              label: 'Jensen-Shannon',
              value: formatDecimal(last.js, 3),
              tone:
                thresholds && last.js >= thresholds.js.critical
                  ? 'text-danger'
                  : thresholds && last.js >= thresholds.js.warning
                    ? 'text-warn'
                    : 'text-ink',
            },
            {
              label: 'KS',
              value: formatDecimal(last.ks, 3),
              tone: last.ks >= 0.2 ? 'text-warn' : 'text-ink',
            },
            {
              label: 'Features em drift',
              value: String(last.drifted),
              tone: last.drifted > 0 ? 'text-danger' : 'text-brand',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-line/70 bg-elevated/35 px-2.5 py-2"
            >
              <p className="text-[10px] font-medium text-muted">{item.label}</p>
              <p className={cx('mono mt-1 text-sm font-semibold leading-none', item.tone)}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <DriftTrendChart data={data} height={height} />
      </div>

      {last ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
          <TrendingUp className="h-3 w-3" />
          Janela mais recente {last.window} · score máximo{' '}
          <span className="mono text-ink">{formatDecimal(last.maxScore, 2)}</span>
        </div>
      ) : null}

      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
}
