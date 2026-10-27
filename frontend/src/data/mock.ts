import {
  Alert,
  CategoricalDistribution,
  DriftLevel,
  DriftSummary,
  DriftThresholds,
  DriftTimelinePoint,
  DistributionPoint,
  Experiment,
  FeatureDriftRow,
  MethodDetail,
  MethodKey,
  ModelInfo,
  PerformancePoint,
  RetrainRecord,
  Severity,
  SimulatorWindow,
} from '@/types';
import { DRIFT_LEVEL_META, clamp, round } from '@/lib/utils';
import { logNormal, mulberry32 } from '@/lib/random';
import { classifyValue } from '@/lib/drift';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TIMELINE_START = Date.UTC(2026, 6, 27, 0, 0, 0);
const TIMELINE_WINDOWS = 12;

export const DEMO_EXPERIMENTS: Experiment[] = [
  {
    id: 1,
    name: 'E1 — Baseline sem drift',
    description:
      'Controle experimental: modelo XGBoost avaliado em janelas semanais sem perturbação das distribuições.',
    drift_level: 'none',
    status: 'completed',
    config: { scenario: 'E1', model_version_id: 1, windows: 12, window_size: 12400 },
    started_at: '2026-07-27T00:00:00.000Z',
    finished_at: '2026-10-19T00:00:00.000Z',
    created_at: '2026-07-25T14:20:00.000Z',
    updated_at: '2026-10-19T00:05:00.000Z',
  },
  {
    id: 2,
    name: 'E2 — Drift moderado (0,5σ)',
    description:
      'Injeção gradual de drift (deslocamento de 0,5σ e 20% de escala) a partir da quarta janela.',
    drift_level: 'moderate',
    status: 'running',
    config: { scenario: 'E2', model_version_id: 2, windows: 12, window_size: 12400 },
    started_at: '2026-08-03T00:00:00.000Z',
    finished_at: null,
    created_at: '2026-08-01T09:10:00.000Z',
    updated_at: '2026-10-19T09:32:00.000Z',
  },
  {
    id: 3,
    name: 'E2 — Drift forte (1,0σ)',
    description:
      'Cenário de estresse com deslocamento de 1,0σ e 50% de mudança de escala para avaliar degradação.',
    drift_level: 'high',
    status: 'completed',
    config: { scenario: 'E2', model_version_id: 3, windows: 12, window_size: 12400 },
    started_at: '2026-07-27T00:00:00.000Z',
    finished_at: '2026-10-12T00:00:00.000Z',
    created_at: '2026-07-24T11:45:00.000Z',
    updated_at: '2026-10-12T18:02:00.000Z',
  },
  {
    id: 4,
    name: 'E4 — Retreinamento orientado por alertas',
    description:
      'Dispara retreinamento quando o alerta crítico de drift é emitido e mede a recuperação de F1.',
    drift_level: 'low',
    status: 'pending',
    config: { scenario: 'E4', model_version_id: 4, windows: 12, window_size: 12400 },
    started_at: null,
    finished_at: null,
    created_at: '2026-10-20T08:30:00.000Z',
    updated_at: '2026-10-20T08:30:00.000Z',
  },
];

export interface FeatureSpec {
  name: string;
  type: 'numeric' | 'categorical';
  description: string;
  mu: number;
  sigma: number;
  scale: number;
  susceptibility: number;
}

export const FEATURE_CATALOG: FeatureSpec[] = [
  {
    name: 'amount',
    type: 'numeric',
    description: 'Valor da transação em unidades monetárias.',
    mu: 6.05,
    sigma: 1.32,
    scale: 1500,
    susceptibility: 1,
  },
  {
    name: 'old_balance_org',
    type: 'numeric',
    description: 'Saldo da conta de origem antes da transação.',
    mu: 8.2,
    sigma: 1.05,
    scale: 7000,
    susceptibility: 0.82,
  },
  {
    name: 'new_balance_org',
    type: 'numeric',
    description: 'Saldo da conta de origem após a transação.',
    mu: 8.08,
    sigma: 1.12,
    scale: 7000,
    susceptibility: 0.86,
  },
  {
    name: 'old_balance_dest',
    type: 'numeric',
    description: 'Saldo da conta de destino antes da transação.',
    mu: 9.3,
    sigma: 1.48,
    scale: 21000,
    susceptibility: 0.7,
  },
  {
    name: 'new_balance_dest',
    type: 'numeric',
    description: 'Saldo da conta de destino após a transação.',
    mu: 9.24,
    sigma: 1.55,
    scale: 21000,
    susceptibility: 0.76,
  },
  {
    name: 'step',
    type: 'numeric',
    description: 'Passo temporal (1 unidade = 1 hora no PaySim).',
    mu: 5.9,
    sigma: 0.62,
    scale: 320,
    susceptibility: 0.34,
  },
  {
    name: 'type',
    type: 'categorical',
    description: 'Tipo da transação: PAYMENT, TRANSFER, CASH_OUT, CASH_IN e DEBIT.',
    mu: 0,
    sigma: 1,
    scale: 1,
    susceptibility: 0.58,
  },
];

const LEVEL_INDEX: Record<DriftLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

function levelSeed(experiment: Experiment, salt = 0): number {
  return experiment.id * 7919 + LEVEL_INDEX[experiment.drift_level] * 104729 + salt;
}

export function windowMeta(index: number): {
  label: string;
  windowStart: string;
  windowEnd: string;
} {
  const start = TIMELINE_START + index * WEEK_MS;
  const end = start + WEEK_MS - 1000;
  return {
    label: `W${String(index + 1).padStart(2, '0')}`,
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
  };
}

function severityOrder(severity: Severity): number {
  return { none: 0, warning: 1, critical: 2 }[severity];
}

function maxSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (acc, severity) => (severityOrder(severity) > severityOrder(acc) ? severity : acc),
    'none',
  );
}

function atLeast(severity: Severity, minimum: Severity): boolean {
  return severityOrder(severity) >= severityOrder(minimum);
}

function buildMethod(
  key: MethodKey,
  thresholds: DriftThresholds,
  value: number | null,
  statistic: number | null,
  available = true,
  reason?: string,
): MethodDetail {
  const rule = thresholds[key];
  const severity = available ? classifyValue(rule, value) : 'none';
  return {
    available,
    value: value === null ? null : round(value, 6),
    statistic: statistic === null ? null : round(statistic, 6),
    threshold: rule.critical,
    warningThreshold: rule.warning,
    direction: rule.direction,
    severity,
    isDrift: available && atLeast(severity, thresholds.trigger_severity),
    ...(reason ? { reason } : {}),
  };
}

// ------------------------------------------------------------
// Drift por feature
// ------------------------------------------------------------
export function buildFeatureDriftRows(
  experiment: Experiment,
  thresholds: DriftThresholds,
): FeatureDriftRow[] {
  const intensity = DRIFT_LEVEL_META[experiment.drift_level].intensity;
  const random = mulberry32(levelSeed(experiment, 11));

  return FEATURE_CATALOG.map((feature, index) => {
    const susceptibility = feature.susceptibility;
    const base = intensity * susceptibility;
    const noise = () => random() - 0.5;

    let psi: number;
    let js: number;
    let ksStat: number;
    let wassersteinNormalized: number;

    if (intensity === 0) {
      psi = 0.008 + random() * 0.022;
      js = 0.002 + random() * 0.008;
      ksStat = 0.024 + random() * 0.024;
      wassersteinNormalized = 0.012 + random() * 0.03;
    } else {
      psi = 0.035 + base * 0.72 + noise() * 0.07 + index * 0.002;
      js = 0.012 + base * 0.19 + noise() * 0.016;
      ksStat = 0.045 + base * 0.42 + noise() * 0.035;
      wassersteinNormalized = 0.035 + base * 0.88 + noise() * 0.055;
    }

    const nReference = 480 + Math.floor(random() * 60);
    const nCurrent = 410 + Math.floor(random() * 50);
    const effective = Math.sqrt((nReference * nCurrent) / (nReference + nCurrent));
    const lambda = (effective + 0.12 + 0.11 / effective) * ksStat;
    const ksPvalue = clamp(2 * Math.exp(-2 * lambda * lambda), 0, 1);
    const wassersteinRaw = wassersteinNormalized * feature.scale;

    if (feature.type === 'categorical') {
      const categoricalPsi = psi * 0.85;
      const categoricalJs = js * 0.9;
      const methods: Record<MethodKey, MethodDetail> = {
        psi: buildMethod('psi', thresholds, categoricalPsi, categoricalPsi),
        ks: buildMethod(
          'ks',
          thresholds,
          null,
          null,
          false,
          'Não aplicável a variáveis categóricas',
        ),
        js: buildMethod('js', thresholds, categoricalJs, categoricalJs),
        wasserstein: buildMethod(
          'wasserstein',
          thresholds,
          null,
          null,
          false,
          'Não aplicável a variáveis categóricas',
        ),
      };
      const severity = maxSeverity(Object.values(methods).map((method) => method.severity));
      return {
        name: feature.name,
        type: 'categorical',
        nReference,
        nCurrent,
        psi: round(categoricalPsi, 6),
        ksStat: null,
        ksPvalue: null,
        js: round(categoricalJs, 6),
        wasserstein: null,
        wassersteinNormalized: null,
        driftScore: round(
          Math.max(
            categoricalPsi / Math.max(thresholds.psi.critical, 1e-6),
            categoricalJs / Math.max(thresholds.js.critical, 1e-6),
          ),
          3,
        ),
        severity,
        isDrift: Object.values(methods).some((method) => method.isDrift),
        insufficientData: false,
        methods,
        warnings: ['KS e Wasserstein não são calculados para variáveis categóricas.'],
      };
    }

    const methods: Record<MethodKey, MethodDetail> = {
      psi: buildMethod('psi', thresholds, psi, psi),
      ks: buildMethod('ks', thresholds, ksPvalue, ksStat),
      js: buildMethod('js', thresholds, js, js),
      wasserstein: buildMethod(
        'wasserstein',
        thresholds,
        wassersteinNormalized,
        wassersteinRaw,
      ),
    };

    const severity = maxSeverity(Object.values(methods).map((method) => method.severity));
    const driftScore = Math.max(
      psi / Math.max(thresholds.psi.critical, 1e-6),
      js / Math.max(thresholds.js.critical, 1e-6),
      wassersteinNormalized / Math.max(thresholds.wasserstein.critical, 1e-6),
      ksPvalue <= thresholds.ks.warning
        ? (thresholds.ks.warning / Math.max(ksPvalue, 1e-9)) * 0.5
        : 0,
    );

    return {
      name: feature.name,
      type: 'numeric',
      nReference,
      nCurrent,
      psi: round(psi, 6),
      ksStat: round(ksStat, 6),
      ksPvalue: round(ksPvalue, 8),
      js: round(js, 6),
      wasserstein: round(wassersteinRaw, 4),
      wassersteinNormalized: round(wassersteinNormalized, 6),
      driftScore: round(Math.min(driftScore, 5), 3),
      severity,
      isDrift: Object.values(methods).some((method) => method.isDrift),
      insufficientData: false,
      methods,
      warnings: [],
    };
  });
}

// ------------------------------------------------------------
// Performance (Pessoa 1)
// ------------------------------------------------------------
function maxDegradation(level: DriftLevel): number {
  return { none: 0.005, low: 0.048, moderate: 0.155, high: 0.33 }[level];
}

function pointFromMetrics(
  experiment: Experiment,
  index: number,
  precision: number,
  recall: number,
  aucRoc: number,
  driftLevel: DriftLevel,
  driftIntensity: number,
): SimulatorWindow {
  const { label, windowStart, windowEnd } = windowMeta(index);
  const totalPredictions = 11800 + ((experiment.id * 37 + index * 13) % 900);
  const positives = 420 + ((experiment.id * 11 + index * 7) % 30);
  const tp = Math.round(recall * positives);
  const fp = Math.max(0, Math.round(tp / Math.max(precision, 0.01) - tp));
  const fn = positives - tp;
  const tn = totalPredictions - positives - fp;
  const accuracy = (tp + tn) / totalPredictions;
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-6);

  return {
    id: experiment.id * 1000 + index + 1,
    modelVersionId:
      typeof experiment.config.model_version_id === 'number'
        ? experiment.config.model_version_id
        : 1,
    windowStart,
    windowEnd,
    label,
    driftLevel,
    driftIntensity,
    accuracy: round(accuracy, 6),
    precision: round(precision, 6),
    recall: round(recall, 6),
    f1: round(f1, 6),
    aucRoc: round(aucRoc, 6),
    totalPredictions,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
  };
}

export function buildPerformanceTimeline(experiment: Experiment): SimulatorWindow[] {
  const random = mulberry32(levelSeed(experiment, 23));
  const level = experiment.drift_level;
  const maxDeg = maxDegradation(level);
  const intensity = DRIFT_LEVEL_META[level].intensity;

  return Array.from({ length: TIMELINE_WINDOWS }, (_, index) => {
    const progress = clamp((index - 2) / 7, 0, 1);
    const degradation = maxDeg * progress;
    const noise = () => (random() - 0.5) * (level === 'none' ? 0.0015 : 0.004);

    const precision = clamp(0.951 - degradation * 0.62 + noise(), 0.45, 0.999);
    const recall = clamp(0.874 - degradation * 1.02 + noise(), 0.3, 0.999);
    const aucRoc = clamp(0.981 - degradation * 0.58 + noise() * 0.6, 0.55, 0.999);

    return pointFromMetrics(
      experiment,
      index,
      precision,
      recall,
      aucRoc,
      level,
      round(intensity * progress, 3),
    );
  });
}

export function makeSimulatedWindow(
  experiment: Experiment,
  previous: SimulatorWindow,
  level: DriftLevel,
  index: number,
): SimulatorWindow {
  const intensity = DRIFT_LEVEL_META[level].intensity;
  const random = mulberry32(levelSeed(experiment, 71 + index * 17));
  const noise = () => (random() - 0.5) * 0.003;
  // Cada avanço acumula um pequeno efeito do cenário selecionado.
  const step = intensity * 0.035;
  const precision = clamp(previous.precision - step * 0.55 + noise(), 0.38, 0.999);
  const recall = clamp(previous.recall - step * 0.9 + noise(), 0.25, 0.999);
  const aucRoc = clamp(previous.aucRoc - step * 0.5 + noise() * 0.5, 0.5, 0.999);

  return {
    ...pointFromMetrics(experiment, index, precision, recall, aucRoc, level, intensity),
    id: experiment.id * 1000 + index + 1,
  };
}

// ------------------------------------------------------------
// Série temporal de drift
// ------------------------------------------------------------
export function buildDriftTimeline(
  experiment: Experiment,
  thresholds: DriftThresholds,
): DriftTimelinePoint[] {
  const intensity = DRIFT_LEVEL_META[experiment.drift_level].intensity;
  const random = mulberry32(levelSeed(experiment, 37));

  return Array.from({ length: TIMELINE_WINDOWS }, (_, index) => {
    const { label, windowEnd } = windowMeta(index);
    const progress = clamp((index - 2) / 7, 0, 1);
    const noise = (random() - 0.5) * (intensity === 0 ? 0.003 : 0.02);
    const psi = Math.max(0.005, 0.018 + intensity * 0.62 * progress + noise);
    const js = Math.max(0.001, 0.004 + intensity * 0.14 * progress + noise * 0.2);
    const ks = clamp(0.04 + intensity * 0.4 * progress + noise * 0.15, 0, 1);
    const maxScore = Math.min(
      4.5,
      Math.max(
        psi / Math.max(thresholds.psi.critical, 1e-6),
        js / Math.max(thresholds.js.critical, 1e-6),
        ks > 0.2 ? ks * 2.2 : 0,
      ),
    );
    const drifted =
      progress === 0
        ? 0
        : Math.round(clamp(intensity * progress * 5.5 + (random() - 0.5) * 0.8, 0, 7));

    return {
      window: label,
      label,
      date: windowEnd,
      psi: round(psi, 4),
      js: round(js, 4),
      ks: round(ks, 4),
      drifted,
      maxScore: round(maxScore, 3),
    };
  });
}

// ------------------------------------------------------------
// Resumo
// ------------------------------------------------------------
export function buildDriftSummary(
  experiment: Experiment,
  rows: FeatureDriftRow[],
): DriftSummary {
  const drifted = rows.filter((row) => row.isDrift).map((row) => row.name);
  const last = windowMeta(TIMELINE_WINDOWS - 1);
  return {
    experiment_id: experiment.id,
    total_metrics: rows.length * TIMELINE_WINDOWS,
    total_features: rows.length,
    drifted_features: drifted,
    max_psi: round(Math.max(...rows.map((row) => row.psi ?? 0)), 6),
    max_ks: round(Math.max(...rows.map((row) => row.ksStat ?? 0)), 6),
    max_js: round(Math.max(...rows.map((row) => row.js ?? 0)), 6),
    max_wasserstein: round(
      Math.max(...rows.map((row) => row.wassersteinNormalized ?? 0)),
      6,
    ),
    last_window_end: last.windowEnd,
  };
}

// ------------------------------------------------------------
// Alertas (Pessoa 2)
// ------------------------------------------------------------
export function buildAlerts(experiment: Experiment, rows: FeatureDriftRow[]): Alert[] {
  const last = windowMeta(TIMELINE_WINDOWS - 1);
  const criticalFeatures = rows
    .filter((row) => row.severity === 'critical')
    .sort((a, b) => b.driftScore - a.driftScore)
    .map((row) => row.name);
  const warningFeatures = rows
    .filter((row) => row.severity === 'warning')
    .map((row) => row.name);
  const maxScore = Math.max(...rows.map((row) => row.driftScore), 0);
  const alerts: Alert[] = [];
  const baseId = experiment.id * 100;

  if (criticalFeatures.length > 0) {
    alerts.push({
      id: baseId + 1,
      experimentId: experiment.id,
      modelVersionId:
        typeof experiment.config.model_version_id === 'number'
          ? experiment.config.model_version_id
          : null,
      type: 'drift_detected',
      severity: 'critical',
      message:
        criticalFeatures.length === 1
          ? `Drift crítico detectado na feature ${criticalFeatures[0]} (janela ${last.label}).`
          : `Drift crítico detectado em ${criticalFeatures.length} features: ${criticalFeatures
              .slice(0, 3)
              .join(', ')}${criticalFeatures.length > 3 ? '…' : ''}.`,
      metadata: {
        window: last.label,
        window_start: last.windowStart,
        window_end: last.windowEnd,
        critical_features: criticalFeatures,
        warning_features: warningFeatures,
        drift_score: round(maxScore, 3),
        per_feature: Object.fromEntries(
          rows.map((row) => [
            row.name,
            {
              psi: row.psi,
              ks_stat: row.ksStat,
              ks_pvalue: row.ksPvalue,
              js: row.js,
              wasserstein: row.wassersteinNormalized,
              severity: row.severity,
            },
          ]),
        ),
      },
      triggeredAt: new Date(Date.parse(last.windowEnd) + 1000 * 60 * 42).toISOString(),
      isResolved: false,
      resolvedAt: null,
    });
  }

  const timeline = buildPerformanceTimeline(experiment);
  const baselineF1 = timeline[0].f1;
  const currentF1 = timeline[timeline.length - 1].f1;
  const degradation = baselineF1 - currentF1;

  if (degradation > 0.03) {
    alerts.push({
      id: baseId + 2,
      experimentId: experiment.id,
      modelVersionId:
        typeof experiment.config.model_version_id === 'number'
          ? experiment.config.model_version_id
          : null,
      type: 'performance_degradation',
      severity: degradation > 0.12 ? 'critical' : 'warning',
      message: `F1 caiu ${(degradation * 100).toFixed(1)} p.p. em relação ao baseline (${(
        baselineF1 * 100
      ).toFixed(1)}% → ${(currentF1 * 100).toFixed(1)}%).`,
      metadata: {
        baseline_f1: round(baselineF1, 4),
        current_f1: round(currentF1, 4),
        delta: round(-degradation, 4),
        window: last.label,
      },
      triggeredAt: new Date(Date.parse(last.windowEnd) + 1000 * 60 * 55).toISOString(),
      isResolved: false,
      resolvedAt: null,
    });
  }

  if (experiment.drift_level === 'moderate' || experiment.drift_level === 'high') {
    alerts.push({
      id: baseId + 3,
      experimentId: experiment.id,
      modelVersionId:
        typeof experiment.config.model_version_id === 'number'
          ? experiment.config.model_version_id
          : null,
      type: 'retrain_triggered',
      severity: 'info',
      message: 'Retreinamento disparado automaticamente pelo alerta de drift crítico.',
      metadata: { reason: 'drift_alert', triggered_by: 'alert_system', window: last.label },
      triggeredAt: new Date(Date.parse(last.windowEnd) + 1000 * 60 * 70).toISOString(),
      isResolved: true,
      resolvedAt: new Date(Date.parse(last.windowEnd) + 1000 * 60 * 74).toISOString(),
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: baseId + 4,
      experimentId: experiment.id,
      modelVersionId: null,
      type: 'monitoring',
      severity: 'info',
      message: 'Nenhum método atingiu o limiar crítico. Monitoramento estável.',
      metadata: { window: last.label, max_drift_score: round(maxScore, 3) },
      triggeredAt: new Date(Date.parse(last.windowEnd) + 1000 * 60 * 30).toISOString(),
      isResolved: false,
      resolvedAt: null,
    });
  }

  return alerts;
}

// ------------------------------------------------------------
// Retreinamento (E4)
// ------------------------------------------------------------
export function buildRetrainHistory(experiment: Experiment): RetrainRecord[] {
  const timeline = buildPerformanceTimeline(experiment);
  const baselineF1 = timeline[0].f1;
  const finalF1 = timeline[timeline.length - 1].f1;
  const last = windowMeta(TIMELINE_WINDOWS - 1);
  const previous = windowMeta(TIMELINE_WINDOWS - 2);

  const records: RetrainRecord[] = [];
  const copy: RetrainRecord = {
    id: experiment.id * 100 + 1,
    experimentId: experiment.id,
    type: 'retrain_completed',
    severity: 'info',
    message: 'Retreino de baseline concluído e artefato promovido a ativo.',
    reason: 'baseline',
    status: 'completed',
    triggeredAt: new Date(Date.parse(previous.windowStart) - 1000 * 60 * 60 * 26).toISOString(),
    version: 'v1.0.0-xgb',
    f1Before: round(Math.max(0.7, baselineF1 - 0.012), 4),
    f1After: round(baselineF1, 4),
  };
  records.push(copy);

  if (experiment.drift_level === 'moderate' || experiment.drift_level === 'high') {
    records.push({
      id: experiment.id * 100 + 2,
      experimentId: experiment.id,
      type: 'retrain_completed',
      severity: 'info',
      message:
        experiment.drift_level === 'high'
          ? 'Retreino emergencial concluído após alerta crítico de drift.'
          : 'Retreino agendado concluído após degradação de F1.',
      reason: 'drift_alert',
      status: 'completed',
      triggeredAt: new Date(Date.parse(last.windowEnd) - 1000 * 60 * 60 * 5).toISOString(),
      version: experiment.drift_level === 'high' ? 'v1.3.0-xgb' : 'v1.2.1-xgb',
      f1Before: round(finalF1, 4),
      f1After: round(
        Math.min(0.938, baselineF1 - (experiment.drift_level === 'high' ? 0.006 : 0.002)),
        4,
      ),
    });
  }

  return records.sort(
    (a, b) => Date.parse(b.triggeredAt) - Date.parse(a.triggeredAt),
  );
}

// ------------------------------------------------------------
// Modelo e dataset
// ------------------------------------------------------------
const FEATURE_IMPORTANCE_BASE = [
  { feature: 'amount', importance: 0.194 },
  { feature: 'old_balance_org', importance: 0.167 },
  { feature: 'new_balance_org', importance: 0.148 },
  { feature: 'old_balance_dest', importance: 0.131 },
  { feature: 'new_balance_dest', importance: 0.119 },
  { feature: 'balance_diff_org', importance: 0.082 },
  { feature: 'balance_diff_dest', importance: 0.071 },
  { feature: 'amount_ratio', importance: 0.054 },
  { feature: 'type', importance: 0.034 },
];

export function buildModelInfo(experiment: Experiment): ModelInfo {
  const isHigh = experiment.drift_level === 'high';
  const isModerate = experiment.drift_level === 'moderate';
  const history = buildRetrainHistory(experiment);
  const latest = history[0];
  const version = isHigh ? 'v1.3.0-xgb' : isModerate ? 'v1.2.1-xgb' : 'v1.1.0-xgb';
  const trainedAt = latest?.triggeredAt ?? '2026-07-26T18:00:00.000Z';
  const random = mulberry32(levelSeed(experiment, 53));

  return {
    version,
    modelType: 'XGBoost (gradient boosting)',
    modelPath: `/app/models/${version}.json`,
    isActive: experiment.status !== 'pending',
    trainedAt,
    dataset: 'PaySim · transações sintéticas',
    samples: 6362620,
    features: 9,
    fraudRate: 0.00129,
    hyperparameters: {
      n_estimators: 400,
      max_depth: 6,
      learning_rate: 0.05,
      subsample: 0.9,
      colsample_bytree: 0.8,
      scale_pos_weight: 12.4,
      tree_method: 'hist',
      eval_metric: 'aucpr',
      early_stopping_rounds: 40,
    },
    trainingMetrics: {
      accuracy: 0.9969,
      precision: 0.951,
      recall: 0.874,
      f1: 0.911,
      aucRoc: 0.981,
      prAuc: 0.842,
    },
    featureImportance: FEATURE_IMPORTANCE_BASE.map((item, index) => ({
      feature: item.feature,
      importance: round(
        Math.max(0.01, item.importance + (random() - 0.5) * 0.008 * (index % 3)),
        4,
      ),
    })),
  };
}

// ------------------------------------------------------------
// Distribuições para gráficos
// ------------------------------------------------------------
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildDistribution(
  featureName: string,
  level: DriftLevel,
  bins = 18,
): DistributionPoint[] {
  const spec = FEATURE_CATALOG.find((feature) => feature.name === featureName);
  const intensity = DRIFT_LEVEL_META[level].intensity;
  const random = mulberry32(hashString(`${featureName}-${level}`));
  const mu = spec?.mu ?? 6;
  const sigma = spec?.sigma ?? 1.2;

  const reference = Array.from({ length: 700 }, () => logNormal(random, mu, sigma));
  const current = Array.from({ length: 560 }, () =>
    logNormal(random, mu + intensity * 0.38, sigma * (1 + intensity * 0.24)),
  );

  const combined = [...reference, ...current].sort((a, b) => a - b);
  const min = combined[Math.floor(combined.length * 0.005)];
  const max = combined[Math.floor(combined.length * 0.995)] || min + 1;
  const width = (max - min) / bins || 1;

  const refCounts = new Array(bins).fill(0);
  const curCounts = new Array(bins).fill(0);

  for (const value of reference) {
    if (value < min || value > max) continue;
    const index = clamp(Math.floor((value - min) / width), 0, bins - 1);
    refCounts[index] += 1;
  }
  for (const value of current) {
    if (value < min || value > max) continue;
    const index = clamp(Math.floor((value - min) / width), 0, bins - 1);
    curCounts[index] += 1;
  }

  return refCounts.map((count, index) => {
    const edge = min + width * index;
    return {
      label:
        spec && spec.scale > 500
          ? new Intl.NumberFormat('pt-BR', {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(edge)
          : edge.toFixed(1),
      reference: count,
      current: curCounts[index],
    };
  });
}

const TYPE_CATEGORIES = ['PAYMENT', 'TRANSFER', 'CASH_OUT', 'CASH_IN', 'DEBIT'];
const TYPE_REFERENCE = [0.216, 0.261, 0.352, 0.082, 0.089];

export function buildCategoricalDistribution(
  level: DriftLevel,
): CategoricalDistribution[] {
  const intensity = DRIFT_LEVEL_META[level].intensity;
  const shift = intensity * 0.1;
  const weights = [
    TYPE_REFERENCE[0] - shift * 0.45,
    TYPE_REFERENCE[1] + shift,
    TYPE_REFERENCE[2] - shift * 0.35,
    TYPE_REFERENCE[3] - shift * 0.1,
    TYPE_REFERENCE[4] - shift * 0.1,
  ];
  const total = weights.reduce((sum, value) => sum + value, 0);
  return TYPE_CATEGORIES.map((label, index) => ({
    label,
    reference: Math.round(TYPE_REFERENCE[index] * 1000),
    current: Math.round((weights[index] / total) * 1000),
  }));
}

// ------------------------------------------------------------
// Simulador / utilidades
// ------------------------------------------------------------
export function buildConfusionMatrix(point: PerformancePoint): {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  total: number;
} {
  return {
    tp: point.truePositives,
    fp: point.falsePositives,
    tn: point.trueNegatives,
    fn: point.falseNegatives,
    total: point.totalPredictions,
  };
}

export function getExperimentRecovery(experiment: Experiment): {
  before: number;
  after: number;
  recovery: number;
  windows: number;
} {
  const history = buildRetrainHistory(experiment);
  const completed = history.find((record) => record.type === 'retrain_completed');
  const before = completed?.f1Before ?? 0.911;
  const after = completed?.f1After ?? 0.911;
  return {
    before,
    after,
    recovery: before > 0 ? (after - before) / before : 0,
    windows: experiment.drift_level === 'high' ? 3 : experiment.drift_level === 'moderate' ? 2 : 0,
  };
}

export const SANDBOX_REFERENCE = [
  42.5, 55.1, 38.7, 61.2, 47.8, 52.3, 44.9, 58.6, 49.1, 53.7, 46.2, 57.4, 40.8,
  50.5, 48.3, 59.9, 43.6, 54.2, 51.8, 56.7, 39.4, 60.1, 45.7, 52.9,
];

export const SANDBOX_CURRENT = [
  68.4, 74.2, 63.9, 79.1, 71.5, 76.8, 66.3, 82.4, 70.2, 77.6, 65.8, 80.3, 69.1,
  73.9, 67.5, 81.2, 64.7, 75.4, 72.8, 78.9, 66.9, 83.1, 68.7, 76.2,
];

export const SANDBOX_STABLE = [
  44.1, 53.8, 41.2, 58.7, 46.9, 51.4, 43.8, 56.2, 47.5, 52.1, 45.3, 55.8, 42.6,
  49.7, 48.4, 57.1, 44.7, 53.2, 50.6, 54.9, 41.9, 58.3, 46.1, 52.7,
];


