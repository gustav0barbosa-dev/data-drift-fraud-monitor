'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { Experiment, RetrainRecord } from '@/types';
import { buildRetrainHistory, getExperimentRecovery } from '@/data/mock';
import { cx, formatDateTime, formatPct, timeAgo } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoRow,
  Meter,
  Select,
} from '@/components/ui';

const REASONS = [
  { value: 'drift_alert', label: 'Alerta crítico de drift' },
  { value: 'performance_degradation', label: 'Degradação de F1' },
  { value: 'scheduled', label: 'Retreino agendado' },
  { value: 'manual', label: 'Solicitação manual' },
];

function recordTone(record: RetrainRecord): 'brand' | 'warn' | 'danger' | 'info' {
  if (record.status === 'failed') return 'danger';
  if (record.status === 'running') return 'warn';
  return 'brand';
}

function recordIcon(record: RetrainRecord) {
  if (record.status === 'failed') return AlertTriangle;
  if (record.status === 'running') return Loader2;
  return CheckCircle2;
}

export function RetrainPanel({
  experiment,
  records,
  currentF1,
}: {
  experiment: Experiment;
  records: RetrainRecord[];
  currentF1: number;
}) {
  const { triggerRetrain, online } = useApp();
  const [reason, setReason] = useState('drift_alert');
  const [busy, setBusy] = useState(false);

  const history = useMemo(() => {
    const map = new Map<number, RetrainRecord>();
    for (const record of [...buildRetrainHistory(experiment), ...records]) {
      map.set(record.id, record);
    }
    return Array.from(map.values()).sort(
      (a, b) => Date.parse(b.triggeredAt) - Date.parse(a.triggeredAt),
    );
  }, [experiment, records]);

  const recovery = useMemo(() => getExperimentRecovery(experiment), [experiment]);
  const latest = history[0];
  const completed = history.filter((record) => record.status === 'completed');
  const running = history.find((record) => record.status === 'running');

  const run = async () => {
    setBusy(true);
    try {
      await triggerRetrain(experiment.id, reason);
    } finally {
      window.setTimeout(() => setBusy(false), 400);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={Wrench}
        title="Retreinamento orientado por alertas"
        description="E4: dispara o job, promove a nova versão e mede a recuperação de F1."
        actions={
          <Badge tone={running ? 'warn' : 'brand'} dot>
            {running ? 'em execução' : `${completed.length} concluídos`}
          </Badge>
        }
      />

      <div className="mt-3 rounded-xl border border-line/70 bg-elevated/35 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="label">Recuperação observada</p>
            <p className="mono mt-1 text-xl font-semibold text-ink">
              {recovery.windows > 0 ? `+${(recovery.recovery * 100).toFixed(1)}%` : '—'}
            </p>
            <p className="text-[10px] text-muted">
              {recovery.windows > 0
                ? `${formatPct(recovery.before, 1)} → ${formatPct(recovery.after, 1)} em ${recovery.windows} janelas`
                : 'Nenhum ciclo de retreino necessário neste cenário.'}
            </p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
            <TrendingUp className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted">F1 antes do retreino</span>
              <span className="mono text-ink">{formatPct(recovery.before, 1)}</span>
            </div>
            <Meter value={recovery.before} max={1} tone="warn" height="h-1.5" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted">F1 depois / atual</span>
              <span className="mono text-ink">{formatPct(Math.max(recovery.after, currentF1), 1)}</span>
            </div>
            <Meter value={Math.max(recovery.after, currentF1)} max={1} tone="brand" height="h-1.5" />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-end gap-2">
          <Select
            label="Motivo do retreino"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-9 text-xs"
            disabled={Boolean(running) || busy}
          >
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            icon={running ? Loader2 : RefreshCw}
            loading={busy || Boolean(running)}
            onClick={run}
            className="shrink-0"
          >
            {running ? 'Executando' : 'Retreinar'}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className={cx('h-1.5 w-1.5 rounded-full', online ? 'bg-brand' : 'bg-warn')} />
          {online
            ? 'A API executa o job em background quando disponível.'
            : 'Sem API: o dashboard simula o ciclo completo localmente.'}
        </div>
      </div>

      <div className="mt-4 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Histórico</span>
          <span className="text-[10px] text-muted">{history.length} eventos</span>
        </div>
        <div className="space-y-2">
          {history.map((record) => {
            const Icon = recordIcon(record);
            return (
              <div
                key={record.id}
                className="rounded-lg border border-line/60 bg-elevated/25 px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cx(
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border',
                      record.status === 'running'
                        ? 'border-warn/25 bg-warn/10 text-warn'
                        : record.status === 'failed'
                          ? 'border-danger/25 bg-danger/10 text-danger'
                          : 'border-brand/25 bg-brand/10 text-brand',
                    )}
                  >
                    <Icon className={cx('h-3 w-3', record.status === 'running' && 'animate-spin')} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={recordTone(record)} className="!py-0 !text-[9px]">
                        {record.status === 'running'
                          ? 'em execução'
                          : record.status === 'failed'
                            ? 'falhou'
                            : 'concluído'}
                      </Badge>
                      {record.version ? (
                        <span className="mono text-[9px] text-muted">{record.version}</span>
                      ) : null}
                      <span className="ml-auto text-[9px] text-muted">
                        {timeAgo(record.triggeredAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink">{record.message}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-muted">
                      <span>motivo: {record.reason}</span>
                      {record.f1Before !== undefined && record.f1After !== undefined ? (
                        <span className="mono">
                          F1 {formatPct(record.f1Before, 1)} → {formatPct(record.f1After, 1)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] text-muted/70">
                      <Clock3 className="h-2.5 w-2.5" />
                      {formatDateTime(record.triggeredAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
        <span>
          Em produção, o endpoint <span className="mono text-ink">POST /api/v1/retrain/</span>{' '}
          registra um alerta do tipo <span className="mono text-ink">retrain_triggered</span> e
          promove o artefato quando o job conclui.
        </span>
      </div>

      <div className="mt-3 border-t border-line/60 pt-2">
        <InfoRow
          label="Próxima versão esperada"
          value={latest?.version ? 'v1.4.0-xgb' : 'v1.0.0-xgb'}
          mono
        />
        <InfoRow
          label="Política"
          value={
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-brand" />
              automática em alerta crítico
            </span>
          }
        />
      </div>
    </Card>
  );
}
