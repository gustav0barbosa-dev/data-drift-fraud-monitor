'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock3,
  Database,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react';
import { Experiment, ExperimentStatus } from '@/types';
import {
  DRIFT_LEVEL_META,
  STATUS_META,
  cx,
  formatDateTime,
  formatShortDate,
} from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '@/components/ui';

export function ExperimentTable({
  experiments,
  selectedId,
  onSelect,
  onStatus,
  onDelete,
  loading = false,
}: {
  experiments: Experiment[];
  selectedId: number | null;
  onSelect: (experiment: Experiment) => void;
  onStatus: (experiment: Experiment, status: ExperimentStatus) => void;
  onDelete: (experiment: Experiment) => void;
  loading?: boolean;
}) {
  if (loading && experiments.length === 0) {
    return (
      <Card className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </Card>
    );
  }

  if (experiments.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Database}
          title="Nenhum experimento encontrado"
          description="Ajuste os filtros ou crie um novo experimento científico."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Experimento</th>
              <th>Drift</th>
              <th>Status</th>
              <th className="!text-right">Janelas</th>
              <th className="!text-right">Modelo</th>
              <th>Criado</th>
              <th>Atualizado</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {experiments.map((experiment) => {
              const selected = experiment.id === selectedId;
              const drift = DRIFT_LEVEL_META[experiment.drift_level];
              const status = STATUS_META[experiment.status];
              return (
                <tr
                  key={experiment.id}
                  onClick={() => onSelect(experiment)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(experiment);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={cx('cursor-pointer', selected && 'bg-brand/5')}
                >
                  <td>
                    <div className="flex items-start gap-2">
                      <span
                        className={cx(
                          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[9px] font-semibold mono',
                          selected
                            ? 'border-brand/35 bg-brand/10 text-brand'
                            : 'border-line bg-elevated/50 text-muted',
                        )}
                      >
                        {String(experiment.config.scenario ?? `E${experiment.id}`)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {experiment.name}
                        </p>
                        <p className="max-w-[360px] truncate text-[10px] text-muted">
                          {experiment.description ?? 'Sem descrição'}
                        </p>
                      </div>
                      {selected ? <Badge tone="brand">selecionado</Badge> : null}
                    </div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        experiment.drift_level === 'high'
                          ? 'danger'
                          : experiment.drift_level === 'moderate'
                            ? 'warn'
                            : experiment.drift_level === 'low'
                              ? 'info'
                              : 'brand'
                      }
                      dot
                    >
                      {drift.label}
                    </Badge>
                  </td>
                  <td>
                    <span className={cx('badge border', status.badge)}>
                      <span className={cx('h-1.5 w-1.5 rounded-full', status.dot)} />
                      {status.label}
                    </span>
                  </td>
                  <td className="mono text-right text-xs">
                    {String(experiment.config.windows ?? '—')}
                  </td>
                  <td className="mono text-right text-xs">
                    v{String(experiment.config.model_version ?? experiment.config.model_version_id ?? '—')}
                  </td>
                  <td className="text-[10px] text-muted">{formatShortDate(experiment.created_at)}</td>
                  <td className="text-[10px] text-muted">{formatDateTime(experiment.updated_at)}</td>
                  <td>
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {experiment.status === 'pending' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Play}
                          onClick={() => onStatus(experiment, 'running')}
                          title="Iniciar experimento"
                          aria-label={`Iniciar ${experiment.name}`}
                        />
                      ) : null}
                      {experiment.status === 'running' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={CheckCircle2}
                          onClick={() => onStatus(experiment, 'completed')}
                          title="Concluir experimento"
                          aria-label={`Concluir ${experiment.name}`}
                        />
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => onDelete(experiment)}
                        title="Remover experimento"
                        aria-label={`Remover ${experiment.name}`}
                        className="text-muted hover:text-danger"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={MoreHorizontal}
                        onClick={() => onSelect(experiment)}
                        title="Selecionar experimento"
                        aria-label={`Selecionar ${experiment.name}`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 px-4 py-2.5 text-[10px] text-muted">
        <span>{experiments.length} experimentos exibidos</span>
        <span className="flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          clique em uma linha para selecionar no dashboard
        </span>
      </div>
    </Card>
  );
}
