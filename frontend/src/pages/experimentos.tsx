'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Cpu,
  Database,
  FlaskConical,
  Play,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Experiment,
  ExperimentCreatePayload,
  ExperimentStatus,
} from '@/types';
import { useApp } from '@/context/AppContext';
import {
  DRIFT_LEVEL_META,
  STATUS_META,
  cx,
  formatDateTime,
  formatNumber,
} from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InfoRow,
  Modal,
  PageHeader,
  PageSkeleton,
  SourceBadge,
} from '@/components/ui';
import { ExperimentTable } from '@/components/experiments/ExperimentTable';
import { ExperimentForm } from '@/components/experiments/ExperimentForm';

const LIFECYCLE: { status: ExperimentStatus; label: string; description: string }[] = [
  { status: 'pending', label: 'Pendente', description: 'Configurado, aguardando execução' },
  { status: 'running', label: 'Executando', description: 'Janelas sendo processadas' },
  { status: 'completed', label: 'Concluído', description: 'Métricas e alertas persistidos' },
];

function lifecycleIndex(status: ExperimentStatus): number {
  if (status === 'running') return 1;
  if (status === 'completed' || status === 'failed') return 2;
  return 0;
}

export default function ExperimentsPage() {
  const router = useRouter();
  const {
    experiments,
    experimentsLoading,
    experimentsSource,
    experimentsError,
    selectedExperimentId,
    selectExperiment,
    createExperiment,
    setExperimentStatus,
    deleteExperiment,
  } = useApp();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ExperimentStatus>('all');
  const [driftFilter, setDriftFilter] = useState<'all' | Experiment['drift_level']>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Experiment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return experiments.filter((experiment) => {
      if (statusFilter !== 'all' && experiment.status !== statusFilter) return false;
      if (driftFilter !== 'all' && experiment.drift_level !== driftFilter) return false;
      if (!normalized) return true;
      return (
        experiment.name.toLowerCase().includes(normalized) ||
        (experiment.description ?? '').toLowerCase().includes(normalized)
      );
    });
  }, [experiments, query, statusFilter, driftFilter]);

  const selected =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    experiments[0];

  const counts = useMemo(
    () => ({
      total: experiments.length,
      running: experiments.filter((experiment) => experiment.status === 'running').length,
      completed: experiments.filter((experiment) => experiment.status === 'completed').length,
      pending: experiments.filter((experiment) => experiment.status === 'pending').length,
    }),
    [experiments],
  );

  const handleCreate = async (payload: ExperimentCreatePayload) => {
    setCreating(true);
    try {
      await createExperiment(payload);
      setFormOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExperiment(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const changeStatus = (experiment: Experiment, status: ExperimentStatus) => {
    void setExperimentStatus(experiment.id, status);
  };

  if (experimentsLoading && experiments.length === 0) {
    return <PageSkeleton />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 3 · Operação"
        persona="Pessoa 3"
        title="Experimentos E1–E4"
        description="Ciclo de vida completo dos cenários científicos: baseline, injeção de drift, comparação de métodos e retreinamento orientado por alertas."
        actions={
          <>
            <Button variant="outline" icon={Database} onClick={() => router.push('/sistema')}>
              Ver banco
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
              Novo experimento
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total', value: counts.total, icon: FlaskConical, tone: 'brand' as const },
            { label: 'Em execução', value: counts.running, icon: Play, tone: 'info' as const },
            { label: 'Concluídos', value: counts.completed, icon: CheckCircle2, tone: 'brand' as const },
            { label: 'Pendentes', value: counts.pending, icon: Clock3, tone: 'warn' as const },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="flex items-center justify-between gap-3">
                <div>
                  <p className="label">{item.label}</p>
                  <p className="mono mt-2 text-2xl font-semibold leading-none text-ink">
                    {item.value}
                  </p>
                </div>
                <span
                  className={cx(
                    'grid h-9 w-9 place-items-center rounded-lg border',
                    item.tone === 'brand'
                      ? 'border-brand/25 bg-brand/10 text-brand'
                      : item.tone === 'info'
                        ? 'border-info/25 bg-info/10 text-info'
                        : 'border-warn/25 bg-warn/10 text-warn',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </Card>
            );
          })}
        </div>

        {experimentsError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[10px] text-muted">
            <span className={cx('h-1.5 w-1.5 rounded-full', experimentsSource === 'demo' ? 'bg-warn' : 'bg-brand')} />
            <span className="min-w-0 flex-1">{experimentsError}</span>
            <SourceBadge source={experimentsSource} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[210px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome ou descrição…"
              aria-label="Buscar experimento"
              className="field h-9 pl-8 text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="field h-9 w-auto min-w-[130px] text-xs"
            aria-label="Filtrar status"
          >
            <option value="all">Todo status</option>
            <option value="pending">Pendente</option>
            <option value="running">Em execução</option>
            <option value="completed">Concluído</option>
            <option value="failed">Falhou</option>
          </select>
          <select
            value={driftFilter}
            onChange={(event) => setDriftFilter(event.target.value as typeof driftFilter)}
            className="field h-9 w-auto min-w-[140px] text-xs"
            aria-label="Filtrar nível de drift"
          >
            <option value="all">Todo drift</option>
            <option value="none">Sem drift</option>
            <option value="low">Drift baixo</option>
            <option value="moderate">Drift moderado</option>
            <option value="high">Drift forte</option>
          </select>
          <span className="text-[10px] text-muted">
            {filtered.length} de {experiments.length}
          </span>
        </div>

        <ExperimentTable
          experiments={filtered}
          selectedId={selectedExperimentId}
          onSelect={(experiment) => selectExperiment(experiment.id)}
          onStatus={changeStatus}
          onDelete={setDeleteTarget}
          loading={experimentsLoading}
        />

        {selected ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                icon={FlaskConical}
                title={selected.name}
                description={selected.description ?? 'Sem descrição registrada.'}
                actions={
                  <div className="flex items-center gap-1.5">
                    <Badge
                      tone={
                        selected.drift_level === 'high'
                          ? 'danger'
                          : selected.drift_level === 'moderate'
                            ? 'warn'
                            : 'brand'
                      }
                      dot
                    >
                      {DRIFT_LEVEL_META[selected.drift_level].label}
                    </Badge>
                    <span className={cx('badge border', STATUS_META[selected.status].badge)}>
                      {STATUS_META[selected.status].label}
                    </span>
                  </div>
                }
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-line/70 bg-elevated/25 px-3 py-2">
                  <p className="label mb-1">Configuração</p>
                  <InfoRow label="ID" value={String(selected.id)} mono />
                  <InfoRow label="Cenário" value={String(selected.config.scenario ?? '—')} mono />
                  <InfoRow label="Janelas" value={String(selected.config.windows ?? '—')} mono />
                  <InfoRow
                    label="Registros/janela"
                    value={formatNumber(Number(selected.config.window_size ?? 0))}
                    mono
                  />
                  <InfoRow
                    label="Modelo"
                    value={`v${String(selected.config.model_version_id ?? '—')}`}
                    mono
                  />
                </div>
                <div className="rounded-xl border border-line/70 bg-elevated/25 px-3 py-2">
                  <p className="label mb-1">Ciclo de vida</p>
                  <InfoRow label="Criado em" value={formatDateTime(selected.created_at)} />
                  <InfoRow label="Atualizado em" value={formatDateTime(selected.updated_at)} />
                  <InfoRow label="Iniciado em" value={formatDateTime(selected.started_at)} />
                  <InfoRow label="Finalizado em" value={formatDateTime(selected.finished_at)} />
                  <InfoRow label="Fonte" value={<SourceBadge source={experimentsSource} />} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                {selected.status === 'pending' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Play}
                    onClick={() => changeStatus(selected, 'running')}
                  >
                    Iniciar experimento
                  </Button>
                ) : null}
                {selected.status === 'running' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckCircle2}
                    onClick={() => changeStatus(selected, 'completed')}
                  >
                    Concluir experimento
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Cpu}
                  onClick={() => router.push(`/modelo`)}
                >
                  Modelo e simulador
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Activity}
                  onClick={() => router.push('/drift')}
                >
                  Drift
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  className="ml-auto"
                  onClick={() => setDeleteTarget(selected)}
                >
                  Remover
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader
                icon={Clock3}
                title="Jornada do experimento"
                description="Estado atual e próximos passos operacionais."
              />
              <div className="mt-3 space-y-0">
                {LIFECYCLE.map((step, index) => {
                  const active = selected.status === step.status;
                  const done = lifecycleIndex(selected.status) > index;
                  const failed = selected.status === 'failed' && index === 2;
                  return (
                    <div key={step.status} className="flex gap-2.5">
                      <div className="flex flex-col items-center">
                        <span
                          className={cx(
                            'grid h-6 w-6 shrink-0 place-items-center rounded-full border',
                            failed
                              ? 'border-danger/30 bg-danger/10 text-danger'
                              : done || active
                                ? 'border-brand/35 bg-brand/10 text-brand'
                                : 'border-line bg-elevated/50 text-muted',
                          )}
                        >
                          {failed ? (
                            <XCircle className="h-3 w-3" />
                          ) : done ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Circle className="h-2.5 w-2.5" />
                          )}
                        </span>
                        {index < LIFECYCLE.length - 1 ? (
                          <span
                            className={cx(
                              'my-0.5 h-7 w-px',
                              done ? 'bg-brand/35' : 'bg-line',
                            )}
                          />
                        ) : null}
                      </div>
                      <div className="pb-2">
                        <p className={cx('text-xs font-medium', active ? 'text-ink' : 'text-muted')}>
                          {step.label}
                          {active ? ' · atual' : ''}
                        </p>
                        <p className="text-[10px] leading-relaxed text-muted">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                <p className="flex items-center gap-1 font-semibold text-ink">
                  <ArrowRight className="h-3 w-3 text-brand" /> Próximo passo
                </p>
                <p className="mt-1">
                  {selected.status === 'pending'
                    ? 'Inicie o experimento para gerar janelas, métricas de drift e desempenho.'
                    : selected.status === 'running'
                      ? 'Acompanhe o drift no laboratório e conclua quando as janelas terminarem.'
                      : 'Compare os resultados com o baseline e registre as conclusões do artigo.'}
                </p>
              </div>
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="Nenhum experimento selecionado"
            description="Crie um experimento para começar."
          />
        )}
      </div>

      <ExperimentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        loading={creating}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remover experimento"
        description="Esta ação remove o experimento e os dados associados."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" icon={Trash2} onClick={handleDelete} loading={deleting}>
              Remover
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-muted">
          Tem certeza que deseja remover{' '}
          <span className="font-semibold text-ink">{deleteTarget?.name}</span>? Métricas, alertas
          e histórico de retreinamento vinculados podem ser apagados em cascata.
        </p>
      </Modal>
    </>
  );
}
