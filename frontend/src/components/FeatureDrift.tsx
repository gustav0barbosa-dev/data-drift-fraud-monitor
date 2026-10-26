'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronRight,
  Filter,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { DriftThresholds, FeatureDriftRow, Severity } from '@/types';
import {
  SEVERITY_META,
  cx,
  featureLabel,
  formatDecimal,
} from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState, Meter, SeverityBadge } from '@/components/ui';

type SortKey = 'score' | 'name' | 'psi' | 'ks' | 'js' | 'wasserstein';

function methodTone(
  row: FeatureDriftRow,
  method: 'psi' | 'ks' | 'js' | 'wasserstein',
): string {
  const severity = row.methods[method].severity;
  return severity === 'critical'
    ? 'text-danger'
    : severity === 'warning'
      ? 'text-warn'
      : 'text-ink';
}

function thresholdHint(
  value: number | null,
  threshold: number,
  direction: 'above' | 'below',
): string {
  if (value === null) return '—';
  return `${direction === 'below' ? 'crítico ≤' : 'crítico ≥'} ${threshold}`;
}

export function FeatureDriftTable({
  rows,
  thresholds,
  onSelect,
  maxRows,
  showFilters = true,
  className,
  compact = false,
  initialSeverity = 'all',
}: {
  rows: FeatureDriftRow[];
  thresholds: DriftThresholds;
  onSelect?: (row: FeatureDriftRow) => void;
  maxRows?: number;
  showFilters?: boolean;
  className?: string;
  compact?: boolean;
  initialSeverity?: 'all' | Severity;
}) {
  const [query, setQuery] = useState('');
  const [onlyDrift, setOnlyDrift] = useState(false);
  const [severity, setSeverity] = useState<'all' | Severity>(initialSeverity);
  const [sortKey, setSortKey] = useState<SortKey>('score');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = rows
      .filter((row) => !onlyDrift || row.isDrift)
      .filter((row) => severity === 'all' || row.severity === severity)
      .filter(
        (row) =>
          !normalized ||
          row.name.toLowerCase().includes(normalized) ||
          featureLabel(row.name).toLowerCase().includes(normalized),
      );

    const sorted = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'score') return b.driftScore - a.driftScore;
      if (sortKey === 'ks') return (a.ksPvalue ?? 1) - (b.ksPvalue ?? 1);
      if (sortKey === 'psi') return (b.psi ?? 0) - (a.psi ?? 0);
      if (sortKey === 'js') return (b.js ?? 0) - (a.js ?? 0);
      return (b.wassersteinNormalized ?? 0) - (a.wassersteinNormalized ?? 0);
    });

    return maxRows ? sorted.slice(0, maxRows) : sorted;
  }, [rows, query, onlyDrift, severity, sortKey, maxRows]);

  return (
    <Card className={cx('overflow-hidden !p-0', className)}>
      <div className="p-[var(--card-pad)] pb-3">
        <CardHeader
          icon={SlidersHorizontal}
          title="Drift por feature"
          description={`${rows.filter((row) => row.isDrift).length} de ${rows.length} features com drift confirmado`}
          actions={
            rows.filter((row) => row.isDrift).length > 0 ? (
              <Badge tone="danger" dot>
                {rows.filter((row) => row.isDrift).length} em drift
              </Badge>
            ) : (
              <Badge tone="brand" dot>
                estável
              </Badge>
            )
          }
        />

        {showFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[190px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar feature…"
                aria-label="Buscar feature"
                className="field h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as 'all' | Severity)}
              aria-label="Filtrar severidade"
              className="field h-8 w-auto min-w-[120px] text-xs"
            >
              <option value="all">Toda severidade</option>
              <option value="critical">Crítico</option>
              <option value="warning">Atenção</option>
              <option value="none">Estável</option>
            </select>

            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              aria-label="Ordenar por"
              className="field h-8 w-auto min-w-[120px] text-xs"
            >
              <option value="score">Maior score</option>
              <option value="psi">PSI</option>
              <option value="ks">KS (p-valor)</option>
              <option value="js">Jensen-Shannon</option>
              <option value="wasserstein">Wasserstein</option>
              <option value="name">Nome</option>
            </select>

            <button
              type="button"
              onClick={() => setOnlyDrift((value) => !value)}
              className={cx(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition',
                onlyDrift
                  ? 'border-danger/35 bg-danger/10 text-danger'
                  : 'border-line bg-elevated/50 text-muted hover:text-ink',
              )}
              aria-pressed={onlyDrift}
            >
              <Filter className="h-3 w-3" />
              Só com drift
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhuma feature encontrada"
            description="Ajuste os filtros ou execute uma nova detecção de drift."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="!text-right">PSI</th>
                <th className="!text-right">KS (D / p)</th>
                <th className="!text-right">JS</th>
                <th className="!text-right">W₁ norm.</th>
                <th>Drift score</th>
                <th>Severidade</th>
                <th aria-label="Abrir detalhe" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.name}
                  onClick={() => onSelect?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect?.(row);
                    }
                  }}
                  tabIndex={onSelect ? 0 : undefined}
                  role={onSelect ? 'button' : undefined}
                  className={cx(onSelect && 'cursor-pointer')}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          SEVERITY_META[row.severity].dot,
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{row.name}</p>
                        <p className="truncate text-[10px] text-muted">
                          {featureLabel(row.name)} ·{' '}
                          {row.type === 'categorical' ? 'categórica' : 'numérica'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right">
                    <span
                      className={cx('mono text-xs font-medium', methodTone(row, 'psi'))}
                      title={thresholdHint(row.psi, thresholds.psi.critical, 'above')}
                    >
                      {formatDecimal(row.psi, 3)}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end">
                      <span
                        className={cx('mono text-xs font-medium', methodTone(row, 'ks'))}
                        title={thresholdHint(
                          row.ksPvalue,
                          thresholds.ks.critical,
                          'below',
                        )}
                      >
                        {row.ksStat === null ? '—' : row.ksStat.toFixed(3)}
                      </span>
                      <span className="mono text-[9px] text-muted">
                        p={row.ksPvalue === null ? '—' : formatDecimal(row.ksPvalue, 4)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <span
                      className={cx('mono text-xs font-medium', methodTone(row, 'js'))}
                      title={thresholdHint(row.js, thresholds.js.critical, 'above')}
                    >
                      {formatDecimal(row.js, 3)}
                    </span>
                  </td>
                  <td className="text-right">
                    <span
                      className={cx(
                        'mono text-xs font-medium',
                        methodTone(row, 'wasserstein'),
                      )}
                      title={
                        row.wasserstein === null
                          ? 'Não aplicável'
                          : `W₁ bruto: ${formatDecimal(row.wasserstein, 2)}`
                      }
                    >
                      {formatDecimal(row.wassersteinNormalized, 3)}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Meter
                        value={Math.min(row.driftScore, 3)}
                        max={3}
                        tone={
                          row.severity === 'critical'
                            ? 'danger'
                            : row.severity === 'warning'
                              ? 'warn'
                              : 'brand'
                        }
                        height="h-1"
                        className="w-16"
                        thresholds={[{ value: 1, tone: 'danger' }]}
                      />
                      <span className="mono text-2xs text-muted">
                        {row.driftScore.toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="w-6">
                    {onSelect ? <ChevronRight className="h-3.5 w-3.5 text-muted" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 px-4 py-2.5 text-[10px] text-muted">
          <span>
            {filtered.length} de {rows.length} features · limiares PSI{' '}
            {thresholds.psi.warning}/{thresholds.psi.critical} · KS p ≤{' '}
            {thresholds.ks.critical} · JS {thresholds.js.critical} · W₁{' '}
            {thresholds.wasserstein.critical}
          </span>
          <span className="flex items-center gap-1">
            <ArrowDownUp className="h-3 w-3" />
            clique em uma linha para detalhar
          </span>
        </div>
      ) : null}
    </Card>
  );
}
