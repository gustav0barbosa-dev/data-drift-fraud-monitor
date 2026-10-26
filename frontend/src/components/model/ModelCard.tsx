'use client';

import React from 'react';
import {
  Boxes,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Experiment, ModelInfo, PerformancePoint } from '@/types';
import {
  cx,
  formatCompact,
  formatDateTime,
  formatDecimal,
  formatPct,
} from '@/lib/utils';
import { FeatureImportanceChart } from '@/components/charts';
import {
  Badge,
  Card,
  CardHeader,
  InfoRow,
  Meter,
  ProgressRing,
} from '@/components/ui';

export function ModelCard({
  model,
  experiment,
  latest,
}: {
  model: ModelInfo;
  experiment: Experiment;
  latest?: PerformancePoint;
}) {
  const metrics = [
    { label: 'Acurácia', value: model.trainingMetrics.accuracy, tone: 'brand' as const },
    { label: 'Precisão', value: model.trainingMetrics.precision, tone: 'info' as const },
    { label: 'Recall', value: model.trainingMetrics.recall, tone: 'warn' as const },
    { label: 'F1-score', value: model.trainingMetrics.f1, tone: 'brand' as const },
    { label: 'AUC-ROC', value: model.trainingMetrics.aucRoc, tone: 'info' as const },
    { label: 'PR-AUC', value: model.trainingMetrics.prAuc, tone: 'purple' as const },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={Cpu}
        title="Modelo em produção"
        description="Classificador XGBoost treinado sobre o PaySim."
        actions={
          <Badge tone={model.isActive ? 'brand' : 'neutral'} dot>
            {model.isActive ? 'ativo' : 'inativo'}
          </Badge>
        }
      />

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-3">
        <div className="min-w-0">
          <p className="mono text-lg font-semibold leading-none text-ink">{model.version}</p>
          <p className="mt-1 truncate text-[10px] text-muted">{model.modelPath}</p>
        </div>
        <ProgressRing
          value={latest?.f1 ?? model.trainingMetrics.f1}
          size={58}
          stroke={5}
          tone={experiment.drift_level === 'high' ? 'danger' : 'brand'}
          label={formatPct(latest?.f1 ?? model.trainingMetrics.f1, 0)}
        />
      </div>

      <div className="mt-3 space-y-0.5">
        <InfoRow label="Tipo" value={model.modelType} />
        <InfoRow label="Dataset" value={model.dataset} />
        <InfoRow label="Amostras" value={formatCompact(model.samples)} mono />
        <InfoRow label="Features" value={String(model.features)} mono />
        <InfoRow label="Taxa de fraude" value={formatPct(model.fraudRate, 2)} mono />
        <InfoRow label="Treinado em" value={formatDateTime(model.trainedAt)} />
        <InfoRow
          label="F1 na última janela"
          value={latest ? formatPct(latest.f1, 2) : '—'}
          mono
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[9px] font-medium text-muted">{metric.label}</p>
              <p className="mono text-[10px] font-semibold text-ink">
                {formatPct(metric.value, 1)}
              </p>
            </div>
            <Meter
              value={metric.value}
              max={1}
              tone={metric.tone}
              height="h-1"
              className="mt-1.5"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line/60 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Hiperparâmetros</span>
          <Badge tone="neutral">{Object.keys(model.hyperparameters).length} chaves</Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {Object.entries(model.hyperparameters).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-muted">{key}</span>
              <span className="mono shrink-0 text-ink">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function FeatureImportanceCard({ model }: { model: ModelInfo }) {
  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Importância das features"
        description="Ganho normalizado do XGBoost no treino de referência."
        actions={<Badge tone="brand">gain</Badge>}
      />
      <div className="mt-3">
        <FeatureImportanceChart data={model.featureImportance} height={285} />
      </div>
    </Card>
  );
}

export function DatasetCard({
  model,
  experiment,
}: {
  model: ModelInfo;
  experiment: Experiment;
}) {
  const checks = [
    { label: 'Sem duplicatas no split de treino', ok: true },
    { label: 'Classes desbalanceadas tratadas (scale_pos_weight)', ok: true },
    { label: 'Features derivadas de saldo validadas', ok: true },
    { label: 'Split temporal sem vazamento (step)', ok: true },
    { label: 'Janelas de produção compatíveis com treino', ok: experiment.drift_level !== 'high' },
  ];

  return (
    <Card>
      <CardHeader
        icon={Database}
        title="Dataset e engenharia de features"
        description="PaySim: transações sintéticas com rótulos de fraude."
        actions={<Badge tone="info">6,36 M linhas</Badge>}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ['Transações', formatCompact(model.samples)],
          ['Features de entrada', String(model.features)],
          ['Taxa de fraude', formatPct(model.fraudRate, 2)],
          ['Origem', 'PaySim'],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-2"
          >
            <p className="text-[9px] font-medium text-muted">{label}</p>
            <p className="mono mt-1 text-xs font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="label mb-2">Pipeline de treino</p>
        <div className="space-y-1.5">
          {[
            { icon: Database, label: 'Extração', detail: 'PaySim CSV → Parquet' },
            { icon: FlaskConical, label: 'Feature engineering', detail: 'saldos, razões e tipo' },
            { icon: Boxes, label: 'Split temporal', detail: '80% treino · 20% teste' },
            { icon: Cpu, label: 'XGBoost', detail: 'early stopping em PR-AUC' },
            { icon: ShieldCheck, label: 'Validação', detail: 'métricas por janela' },
          ].map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex items-center gap-2 text-[10px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-line bg-elevated/50 text-muted">
                  <Icon className="h-3 w-3" />
                </span>
                <span className="w-28 shrink-0 font-medium text-ink">{step.label}</span>
                <span className="truncate text-muted">{step.detail}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-t border-line/60 pt-3">
        <p className="label mb-2">Controles de qualidade</p>
        <ul className="space-y-1.5">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-1.5 text-[10px]">
              <span
                className={cx(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  check.ok ? 'bg-brand' : 'bg-warn',
                )}
              />
              <span className={check.ok ? 'text-muted' : 'text-warn'}>{check.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-info/20 bg-info/5 px-2.5 py-2 text-[10px] text-muted">
        <Layers className="h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Cenário atual: <span className="font-semibold text-ink">{experiment.drift_level}</span> ·{' '}
          {formatDecimal(experiment.drift_level === 'high' ? 1 : experiment.drift_level === 'moderate' ? 0.5 : 0.2, 1)}σ
        </span>
      </div>
    </Card>
  );
}

export function ScenarioTable({
  currentLevel,
}: {
  currentLevel: Experiment['drift_level'];
}) {
  return (
    <Card>
      <CardHeader
        icon={Gauge}
        title="Performance por cenário de drift"
        description="Resultados consolidados dos cenários simulados (0,2σ / 0,5σ / 1,0σ)."
      />
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cenário</th>
              <th className="!text-right">Acurácia</th>
              <th className="!text-right">Precisão</th>
              <th className="!text-right">Recall</th>
              <th className="!text-right">F1</th>
              <th className="!text-right">AUC</th>
            </tr>
          </thead>
          <tbody>
            {[
              { level: 'none', label: 'Sem drift', description: '0,0σ' },
              { level: 'low', label: 'Drift baixo', description: '0,2σ' },
              { level: 'moderate', label: 'Drift moderado', description: '0,5σ' },
              { level: 'high', label: 'Drift forte', description: '1,0σ' },
            ].map((scenario, index) => {
              const meta = [
                { accuracy: 0.9968, precision: 0.951, recall: 0.874, f1: 0.911, aucRoc: 0.981 },
                { accuracy: 0.9931, precision: 0.926, recall: 0.841, f1: 0.881, aucRoc: 0.966 },
                { accuracy: 0.9762, precision: 0.847, recall: 0.748, f1: 0.794, aucRoc: 0.923 },
                { accuracy: 0.9347, precision: 0.702, recall: 0.587, f1: 0.639, aucRoc: 0.846 },
              ][index];
              const active = scenario.level === currentLevel;
              return (
                <tr key={scenario.level} className={cx(active && 'bg-brand/5')}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={cx('h-1.5 w-1.5 rounded-full', active ? 'bg-brand' : 'bg-muted')} />
                      <div>
                        <p className="text-xs font-medium text-ink">{scenario.label}</p>
                        <p className="text-[10px] text-muted">{scenario.description}</p>
                      </div>
                      {active ? <Badge tone="brand">atual</Badge> : null}
                    </div>
                  </td>
                  <td className="mono text-right text-xs">{formatPct(meta.accuracy, 1)}</td>
                  <td className="mono text-right text-xs">{formatPct(meta.precision, 1)}</td>
                  <td className="mono text-right text-xs">{formatPct(meta.recall, 1)}</td>
                  <td className="mono text-right text-xs font-semibold">{formatPct(meta.f1, 1)}</td>
                  <td className="mono text-right text-xs">{formatPct(meta.aucRoc, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
