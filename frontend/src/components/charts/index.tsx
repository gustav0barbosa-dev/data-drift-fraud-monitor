'use client';

import React from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DriftTimelinePoint,
  DistributionPoint,
  E3LatencyPoint,
  PerformancePoint,
  Severity,
} from '@/types';
import { METHOD_META, SEVERITY_META, formatPct } from '@/lib/utils';
import { E3_METHOD_COLORS } from '@/data/e3';

export const METRIC_COLORS: Record<string, string> = {
  f1: '#34d399',
  precision: '#38bdf8',
  recall: '#fbbf24',
  aucRoc: '#c084fc',
  accuracy: '#94a3b8',
};

export const METRIC_LABELS: Record<string, string> = {
  f1: 'F1-score',
  precision: 'Precisão',
  recall: 'Recall',
  aucRoc: 'AUC-ROC',
  accuracy: 'Acurácia',
};

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface/95 px-3 py-2 shadow-[var(--shadow-pop)] backdrop-blur">
      {label !== undefined ? (
        <p className="mb-1 text-2xs font-semibold text-ink">{label}</p>
      ) : null}
      <div className="space-y-0.5">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name}-${index}`}
            className="flex items-center justify-between gap-4 text-2xs"
          >
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: entry.color ?? '#8c9ab0' }}
              />
              {entry.name}
            </span>
            <span className="mono font-semibold text-ink">
              {typeof entry.value === 'number' && formatter
                ? formatter(entry.value, String(entry.name))
                : typeof entry.value === 'number'
                  ? entry.value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
                  : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend({
  items,
}: {
  items: { key: string; label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5 text-2xs text-muted">
          <span
            className={item.dashed ? 'h-0 w-4 border-t border-dashed' : 'h-1.5 w-1.5 rounded-full'}
            style={
              item.dashed
                ? { borderColor: item.color }
                : { background: item.color }
            }
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// Performance
// ============================================================
export function PerformanceChart({
  data,
  metrics = ['f1', 'precision', 'recall'],
  height = 280,
  showLegend = true,
  baseline,
}: {
  data: PerformancePoint[];
  metrics?: ('f1' | 'precision' | 'recall' | 'aucRoc' | 'accuracy')[];
  height?: number;
  showLegend?: boolean;
  baseline?: number;
}) {
  const values = data.flatMap((point) => metrics.map((metric) => point[metric]));
  const min = Math.min(...values, 0.5);
  const lower = Math.max(0.3, Math.floor((min - 0.04) * 10) / 10);

  return (
    <div>
      {showLegend ? (
        <div className="mb-3">
          <ChartLegend
            items={metrics.map((metric) => ({
              key: metric,
              label: METRIC_LABELS[metric],
              color: METRIC_COLORS[metric],
            }))}
          />
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {metrics.map((metric) => (
              <linearGradient id={`perf-${metric}`} key={metric} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METRIC_COLORS[metric]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={METRIC_COLORS[metric]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6} />
          <YAxis
            domain={[lower, 1]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            width={44}
          />
          {baseline !== undefined ? (
            <ReferenceLine
              y={baseline}
              stroke="rgb(140 154 176 / 0.55)"
              strokeDasharray="4 4"
              label={{
                value: 'baseline',
                position: 'insideTopRight',
                fill: '#8c9ab0',
                fontSize: 10,
              }}
            />
          ) : null}
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value) => formatPct(value, 1)}
              />
            }
          />
          {metrics.map((metric, index) =>
            index === 0 ? (
              <Area
                key={metric}
                type="monotone"
                dataKey={metric}
                name={METRIC_LABELS[metric]}
                stroke={METRIC_COLORS[metric]}
                strokeWidth={2.4}
                fill={`url(#perf-${metric})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ) : (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                name={METRIC_LABELS[metric]}
                stroke={METRIC_COLORS[metric]}
                strokeWidth={1.6}
                strokeDasharray={metric === 'aucRoc' ? '5 3' : undefined}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Drift ao longo das janelas
// ============================================================
export function DriftTrendChart({
  data,
  height = 250,
}: {
  data: DriftTimelinePoint[];
  height?: number;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ChartLegend
          items={[
            { key: 'psi', label: 'PSI médio', color: '#34d399' },
            { key: 'drifted', label: 'Features em drift', color: '#fb7185' },
          ]}
        />
        <span className="text-2xs text-muted">limiares PSI 0,10 / 0,25</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: -10, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="drift-psi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6} />
          <YAxis
            yAxisId="psi"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => value.toFixed(2)}
            width={44}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <ReferenceLine
            yAxisId="psi"
            y={0.25}
            stroke="#fb7185"
            strokeDasharray="5 4"
            strokeOpacity={0.7}
            label={{
              value: 'crítico',
              position: 'insideTopRight',
              fill: '#fb7185',
              fontSize: 9,
            }}
          />
          <ReferenceLine
            yAxisId="psi"
            y={0.1}
            stroke="#fbbf24"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value, name) =>
                  name === 'Features em drift' ? String(value) : value.toFixed(3)
                }
              />
            }
          />
          <Bar
            yAxisId="count"
            dataKey="drifted"
            name="Features em drift"
            fill="#fb7185"
            fillOpacity={0.2}
            radius={[3, 3, 0, 0]}
            barSize={14}
          />
          <Area
            yAxisId="psi"
            type="monotone"
            dataKey="psi"
            name="PSI médio"
            stroke="#34d399"
            strokeWidth={2.2}
            fill="url(#drift-psi)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Distribuições
// ============================================================
export function DistributionChart({
  data,
  height = 220,
  referenceLabel = 'Referência',
  currentLabel = 'Janela atual',
}: {
  data: DistributionPoint[];
  height?: number;
  referenceLabel?: string;
  currentLabel?: string;
}) {
  return (
    <div>
      <div className="mb-2">
        <ChartLegend
          items={[
            { key: 'ref', label: referenceLabel, color: '#64748b' },
            { key: 'cur', label: currentLabel, color: '#34d399' },
          ]}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} dy={4} />
          <YAxis tickLine={false} axisLine={false} width={38} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="reference" name={referenceLabel} fill="#64748b" fillOpacity={0.45} radius={[2, 2, 0, 0]} />
          <Line
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="#34d399"
            strokeWidth={2.2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Importância de features
// ============================================================
export function FeatureImportanceChart({
  data,
  height = 260,
}: {
  data: { feature: string; importance: number }[];
  height?: number;
}) {
  const sorted = [...data].sort((a, b) => b.importance - a.importance);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={sorted}
        layout="vertical"
        margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
      >
        <XAxis
          type="number"
          tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
          tickLine={false}
          axisLine={false}
          domain={[0, 'auto']}
        />
        <YAxis
          type="category"
          dataKey="feature"
          tickLine={false}
          axisLine={false}
          width={110}
          tick={{ fontSize: 10 }}
        />
        <Tooltip content={<ChartTooltip formatter={(value) => formatPct(value, 1)} />} />
        <Bar dataKey="importance" name="Importância" radius={[0, 4, 4, 0]} barSize={14}>
          {sorted.map((entry, index) => (
            <Cell
              key={entry.feature}
              fill={`rgba(52, 211, 153, ${0.85 - index * 0.055})`}
            />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// E3 — detecção por cenário e latência
// ============================================================
export function DetectionByScenarioChart({
  data,
  height = 280,
}: {
  data: { label: string; psi: number; ks: number; js: number; wasserstein: number }[];
  height?: number;
}) {
  return (
    <div>
      <div className="mb-3">
        <ChartLegend
          items={(['psi', 'ks', 'js', 'wasserstein'] as const).map((key) => ({
            key,
            label: METHOD_META[key].short,
            color: E3_METHOD_COLORS[key],
          }))}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6} />
          <YAxis
            domain={[0, 1.08]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            width={44}
          />
          <Tooltip content={<ChartTooltip formatter={(value) => formatPct(value, 1)} />} />
          <Bar dataKey="psi" name="PSI" fill={E3_METHOD_COLORS.psi} radius={[3, 3, 0, 0]} barSize={13} />
          <Bar dataKey="ks" name="KS" fill={E3_METHOD_COLORS.ks} radius={[3, 3, 0, 0]} barSize={13} />
          <Bar dataKey="js" name="Jensen-Shannon" fill={E3_METHOD_COLORS.js} radius={[3, 3, 0, 0]} barSize={13} />
          <Bar
            dataKey="wasserstein"
            name="Wasserstein"
            fill={E3_METHOD_COLORS.wasserstein}
            radius={[3, 3, 0, 0]}
            barSize={13}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LatencyChart({
  data,
  height = 250,
}: {
  data: E3LatencyPoint[];
  height?: number;
}) {
  return (
    <div>
      <div className="mb-3">
        <ChartLegend
          items={(['psi', 'ks', 'js', 'wasserstein'] as const).map((key) => ({
            key,
            label: METHOD_META[key].short,
            color: E3_METHOD_COLORS[key],
          }))}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="window"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `W${value}`}
            dy={6}
          />
          <YAxis
            domain={[0, 1.05]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            width={44}
          />
          <Tooltip
            labelFormatter={(value) => `Janela W${value}`}
            content={<ChartTooltip formatter={(value) => formatPct(value, 0)} />}
          />
          {(['psi', 'ks', 'js', 'wasserstein'] as const).map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={METHOD_META[key].short}
              stroke={E3_METHOD_COLORS[key]}
              strokeWidth={1.9}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Donut de severidade
// ============================================================
export function SeverityDonut({
  counts,
  height = 150,
}: {
  counts: Record<Severity, number>;
  height?: number;
}) {
  const data = (['none', 'warning', 'critical'] as Severity[])
    .map((severity) => ({
      name: SEVERITY_META[severity].label,
      value: counts[severity],
      severity,
    }))
    .filter((entry) => entry.value > 0);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const colors: Record<Severity, string> = {
    none: '#34d399',
    warning: '#fbbf24',
    critical: '#fb7185',
  };

  if (total === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center text-2xs text-muted">
        Sem dados de severidade
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="66%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.severity} fill={colors[entry.severity]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-xl font-semibold leading-none text-ink">{total}</span>
        <span className="mt-1 text-[10px] text-muted">features</span>
      </div>
    </div>
  );
}

