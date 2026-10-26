'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  DriftMetric,
  DriftSummary,
  DriftThresholds,
  DriftTimelinePoint,
  Experiment,
  FeatureDriftRow,
  MethodDetail,
  MethodKey,
  ModelInfo,
  PerformancePoint,
  RetrainRecord,
  Severity,
} from '@/types';
import { useApp } from '@/context/AppContext';
import {
  FEATURE_CATALOG,
  buildAlerts,
  buildDriftSummary,
  buildDriftTimeline,
  buildFeatureDriftRows,
  buildModelInfo,
  buildPerformanceTimeline,
} from '@/data/mock';
import { classifyValue, methodValueLabel } from '@/lib/drift';
import { round } from '@/lib/utils';
import { api } from '@/services/api';

export interface MonitorData {
  experiment: Experiment;
  features: FeatureDriftRow[];
  performance: PerformancePoint[];
  driftTimeline: DriftTimelinePoint[];
  alerts: Alert[];
  summary: DriftSummary;
  model: ModelInfo;
  source: 'live' | 'demo' | 'mixed';
  loading: boolean;
  lastSync: Date;
  liveMetrics: boolean;
  liveAlerts: boolean;
  livePerformance: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  none: 0,
  warning: 1,
  critical: 2,
};

function maxSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (acc, severity) =>
      SEVERITY_ORDER[severity] > SEVERITY_ORDER[acc] ? severity : acc,
    'none',
  );
}

function featureScale(name: string): number {
  return FEATURE_CATALOG.find((feature) => feature.name === name)?.scale ?? 1;
}

function metricMethods(
  metric: DriftMetric,
  thresholds: DriftThresholds,
  categorical: boolean,
): Record<MethodKey, MethodDetail> {
  const psi = metric.psi_value;
  const ksStat = metric.ks_value;
  const ksP = metric.ks_pvalue;
  const js = metric.js_value;
  const rawW = metric.wasserstein_value;
  const normalizedW = rawW === null ? null : rawW / featureScale(metric.feature_name);

  const build = (
    key: MethodKey,
    value: number | null,
    statistic: number | null,
    available: boolean,
    reason?: string,
  ): MethodDetail => {
    const rule = thresholds[key];
    const severity = available ? classifyValue(rule, value) : 'none';
    return {
      available,
      value,
      statistic,
      threshold: rule.critical,
      warningThreshold: rule.warning,
      direction: rule.direction,
      severity,
      isDrift:
        available &&
        SEVERITY_ORDER[severity] >= SEVERITY_ORDER[thresholds.trigger_severity],
      ...(reason ? { reason } : {}),
    };
  };

  return {
    psi: build('psi', psi, psi, psi !== null),
    ks: build(
      'ks',
      ksP,
      ksStat,
      !categorical && ksP !== null,
      categorical ? 'Não aplicável a variáveis categóricas' : undefined,
    ),
    js: build('js', js, js, js !== null),
    wasserstein: build(
      'wasserstein',
      normalizedW,
      rawW,
      !categorical && rawW !== null,
      categorical ? 'Não aplicável a variáveis categóricas' : undefined,
    ),
  };
}

export function rowsFromMetrics(
  metrics: DriftMetric[],
  thresholds: DriftThresholds,
): FeatureDriftRow[] {
  const latest = new Map<string, DriftMetric>();
  for (const metric of metrics) {
    const current = latest.get(metric.feature_name);
    if (
      !current ||
      new Date(metric.window_end).getTime() > new Date(current.window_end).getTime()
    ) {
      latest.set(metric.feature_name, metric);
    }
  }

  return Array.from(latest.values())
    .map((metric) => {
      const categorical = metric.feature_name === 'type';
      const methods = metricMethods(metric, thresholds, categorical);
      const severity = maxSeverity(Object.values(methods).map((method) => method.severity));
      const score = Math.max(
        (metric.psi_value ?? 0) / Math.max(thresholds.psi.critical, 1e-6),
        (metric.js_value ?? 0) / Math.max(thresholds.js.critical, 1e-6),
        methods.wasserstein.value === null
          ? 0
          : methods.wasserstein.value / Math.max(thresholds.wasserstein.critical, 1e-6),
      );

      return {
        name: metric.feature_name,
        type: categorical ? ('categorical' as const) : ('numeric' as const),
        nReference: 0,
        nCurrent: 0,
        psi: metric.psi_value,
        ksStat: metric.ks_value,
        ksPvalue: metric.ks_pvalue,
        js: metric.js_value,
        wasserstein: metric.wasserstein_value,
        wassersteinNormalized: methods.wasserstein.value,
        driftScore: round(Math.min(score, 5), 3),
        severity,
        isDrift: metric.is_drift || Object.values(methods).some((method) => method.isDrift),
        insufficientData: false,
        methods,
        warnings: categorical
          ? ['KS e Wasserstein não são calculados para variáveis categóricas.']
          : [],
      } satisfies FeatureDriftRow;
    })
    .sort((a, b) => b.driftScore - a.driftScore);
}

export function timelineFromMetrics(
  metrics: DriftMetric[],
  thresholds: DriftThresholds,
): DriftTimelinePoint[] {
  const groups = new Map<string, DriftMetric[]>();
  for (const metric of metrics) {
    const key = metric.window_end;
    groups.set(key, [...(groups.get(key) ?? []), metric]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([windowEnd, items], index) => {
      const psi = items.reduce((sum, item) => sum + (item.psi_value ?? 0), 0) / items.length;
      const js = items.reduce((sum, item) => sum + (item.js_value ?? 0), 0) / items.length;
      const ks = items.reduce((sum, item) => sum + (item.ks_value ?? 0), 0) / items.length;
      const drifted = new Set(
        items.filter((item) => item.is_drift).map((item) => item.feature_name),
      ).size;
      const maxScore = Math.max(
        ...items.map((item) =>
          Math.max(
            (item.psi_value ?? 0) / Math.max(thresholds.psi.critical, 1e-6),
            (item.js_value ?? 0) / Math.max(thresholds.js.critical, 1e-6),
            (item.ks_value ?? 0) > 0.2 ? (item.ks_value ?? 0) * 2.2 : 0,
          ),
        ),
      );
      return {
        window: `W${String(index + 1).padStart(2, '0')}`,
        label: `W${String(index + 1).padStart(2, '0')}`,
        date: windowEnd,
        psi: round(psi, 4),
        js: round(js, 4),
        ks: round(ks, 4),
        drifted,
        maxScore: round(Math.min(maxScore, 5), 3),
      };
    });
}

function buildDemoData(
  experiment: Experiment,
  thresholds: DriftThresholds,
): MonitorData {
  const features = buildFeatureDriftRows(experiment, thresholds);
  return {
    experiment,
    features,
    performance: buildPerformanceTimeline(experiment),
    driftTimeline: buildDriftTimeline(experiment, thresholds),
    alerts: buildAlerts(experiment, features),
    summary: buildDriftSummary(experiment, features),
    model: buildModelInfo(experiment),
    source: 'demo',
    loading: false,
    lastSync: new Date(),
    liveMetrics: false,
    liveAlerts: false,
    livePerformance: false,
  };
}

export interface MonitorDataWithRetrains extends MonitorData {
  retrainRecords: RetrainRecord[];
}

export function useMonitorData(
  experiment: Experiment | undefined,
): MonitorDataWithRetrains | null {
  const {
    thresholds,
    online,
    settings,
    refreshKey,
    resolvedOverrides,
    retrains,
    experimentsSource,
  } = useApp();
  const [data, setData] = useState<MonitorData | null>(null);
  const [tick, setTick] = useState(0);

  // Polling local dos dados de monitoramento.
  useEffect(() => {
    if (online !== true || settings.forceDemo || settings.pollInterval <= 0) return;
    const interval = window.setInterval(
      () => setTick((value) => value + 1),
      settings.pollInterval * 1000,
    );
    return () => window.clearInterval(interval);
  }, [online, settings.forceDemo, settings.pollInterval]);

  useEffect(() => {
    if (!experiment) {
      setData(null);
      return;
    }

    let cancelled = false;
    const demo = buildDemoData(experiment, thresholds);
    const applyOverrides = (alerts: Alert[]): Alert[] =>
      alerts.map((alert) =>
        resolvedOverrides[alert.id] !== undefined
          ? {
              ...alert,
              isResolved: resolvedOverrides[alert.id],
              resolvedAt: resolvedOverrides[alert.id]
                ? new Date().toISOString()
                : null,
            }
          : alert,
      );

    if (online !== true || settings.forceDemo || experimentsSource === 'demo') {
      setData({ ...demo, alerts: applyOverrides(demo.alerts) });
      return;
    }

    setData((current) =>
      current
        ? { ...current, experiment, loading: true }
        : { ...demo, experiment, loading: true },
    );

    const load = async () => {
      const modelVersionId =
        typeof experiment.config.model_version_id === 'number'
          ? experiment.config.model_version_id
          : null;

      const [metricsResult, summaryResult, alertsResult, performanceResult] =
        await Promise.all([
          api.drift
            .metrics(experiment.id, { limit: 500 })
            .catch(() => null),
          api.drift.summary(experiment.id).catch(() => null),
          api.drift.alerts(experiment.id, true).catch(() => null),
          modelVersionId
            ? api.metrics.performance(modelVersionId).catch(() => [] as PerformancePoint[])
            : Promise.resolve([] as PerformancePoint[]),
        ]);

      if (cancelled) return;

      let features = demo.features;
      let driftTimeline = demo.driftTimeline;
      let summary = demo.summary;
      let alerts = demo.alerts;
      let performance = demo.performance;
      let liveMetrics = false;
      let liveAlerts = false;
      let livePerformance = false;

      if (metricsResult && metricsResult.length > 0) {
        features = rowsFromMetrics(metricsResult, thresholds);
        driftTimeline = timelineFromMetrics(metricsResult, thresholds);
        liveMetrics = true;
      }

      if (summaryResult) {
        summary = summaryResult;
      } else if (liveMetrics) {
        summary = buildDriftSummary(experiment, features);
      }

      if (alertsResult) {
        alerts = applyOverrides(alertsResult.items);
        liveAlerts = true;
      } else {
        alerts = applyOverrides(alerts);
      }

      if (performanceResult.length > 0) {
        performance = performanceResult.map((point, index) => ({
          ...point,
          label: `W${String(index + 1).padStart(2, '0')}`,
        }));
        livePerformance = true;
      }

      const liveCount = [liveMetrics, liveAlerts, livePerformance].filter(Boolean).length;
      const source: MonitorData['source'] =
        liveCount === 3 ? 'live' : liveCount > 0 ? 'mixed' : 'demo';

      setData({
        experiment,
        features,
        performance,
        driftTimeline,
        alerts,
        summary,
        model: buildModelInfo(experiment),
        source,
        loading: false,
        lastSync: new Date(),
        liveMetrics,
        liveAlerts,
        livePerformance,
      });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    experiment,
    thresholds,
    online,
    settings.forceDemo,
    experimentsSource,
    refreshKey,
    tick,
    resolvedOverrides,
  ]);

  // Mantém o histórico de retreinamentos visível para as páginas.
  if (!data) return null;
  return {
    ...data,
    retrainRecords: retrains[data.experiment.id] ?? [],
  };
}

export function methodDisplayValue(method: MethodKey, row: FeatureDriftRow): string {
  const detail = row.methods[method];
  return methodValueLabel(method, detail.value);
}
