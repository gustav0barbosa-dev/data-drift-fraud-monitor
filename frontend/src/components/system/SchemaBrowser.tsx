'use client';

import React, { useMemo, useState } from 'react';
import {
  Columns3,
  Database,
  KeyRound,
  Link2,
  Table2,
} from 'lucide-react';
import { SCHEMA_TABLES } from '@/data/platform';
import { cx, formatNumber } from '@/lib/utils';
import { Badge, Card, CardHeader } from '@/components/ui';

export function SchemaBrowser() {
  const [selected, setSelected] = useState(SCHEMA_TABLES[0]?.name ?? 'experiments');
  const table = useMemo(
    () => SCHEMA_TABLES.find((item) => item.name === selected) ?? SCHEMA_TABLES[0],
    [selected],
  );

  if (!table) return null;

  const totalColumns = SCHEMA_TABLES.reduce((sum, item) => sum + item.columns.length, 0);

  return (
    <Card>
      <CardHeader
        icon={Database}
        title="Modelo de dados PostgreSQL"
        description="Schema normalizado com séries temporais, métricas de drift e auditoria de alertas."
        actions={
          <div className="flex items-center gap-1.5">
            <Badge tone="info">{SCHEMA_TABLES.length} tabelas</Badge>
            <Badge tone="neutral">{totalColumns} colunas</Badge>
          </div>
        }
      />

      <div className="mt-3 grid gap-3 lg:grid-cols-[230px_1fr]">
        <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-line/70 bg-elevated/20 p-1.5 lg:flex-col lg:overflow-visible">
          {SCHEMA_TABLES.map((item) => {
            const active = item.name === table.name;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelected(item.name)}
                className={cx(
                  'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition lg:w-full',
                  active
                    ? 'bg-brand/10 text-ink ring-1 ring-brand/25'
                    : 'text-muted hover:bg-elevated/60 hover:text-ink',
                )}
              >
                <Table2
                  className={cx('h-3.5 w-3.5 shrink-0', active ? 'text-brand' : 'text-muted')}
                />
                <span className="min-w-0 flex-1">
                  <span className="mono block truncate text-[11px] font-medium">{item.name}</span>
                  <span className="block truncate text-[9px] text-muted">{item.label}</span>
                </span>
                <span className="mono shrink-0 text-[9px] text-muted">{item.rows}</span>
              </button>
            );
          })}
        </div>

        <div className="min-w-0">
          <div className="rounded-xl border border-line/70 bg-elevated/20 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-sm font-semibold text-ink">{table.name}</span>
              <Badge tone="neutral">{table.rows} linhas</Badge>
              <Badge tone="info">{table.columns.length} colunas</Badge>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">{table.description}</p>
          </div>

          <div className="mt-2 overflow-x-auto rounded-xl border border-line/70">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Coluna</th>
                  <th>Tipo</th>
                  <th>Chave</th>
                  <th>Nulo</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((column) => (
                  <tr key={column.name}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Columns3 className="h-3 w-3 text-muted" />
                        <span className="mono text-xs text-ink">{column.name}</span>
                      </div>
                    </td>
                    <td className="mono text-[10px] text-muted">{column.type}</td>
                    <td>
                      {column.key ? (
                        <Badge
                          tone={column.key === 'FK' ? 'info' : 'brand'}
                          className="!py-0 !text-[9px]"
                          icon={column.key === 'FK' ? Link2 : KeyRound}
                        >
                          {column.key}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted">—</span>
                      )}
                    </td>
                    <td className="text-[10px] text-muted">
                      {column.nullable ? 'sim' : 'não'}
                    </td>
                    <td className="text-[10px] text-muted">{column.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <KeyRound className="h-3 w-3 text-brand" /> PK/UNIQUE
            </span>
            <span className="flex items-center gap-1">
              <Link2 className="h-3 w-3 text-info" /> FK com cascade em experimentos
            </span>
            <span className="ml-auto">
              total estimado:{' '}
              <span className="mono text-ink">
                {formatNumber(
                  SCHEMA_TABLES.reduce((sum, item) => {
                    const value = Number(item.rows.replace(/\./g, '').replace(/,/g, '.'));
                    return sum + (Number.isFinite(value) ? value : 0);
                  }, 0),
                )}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
