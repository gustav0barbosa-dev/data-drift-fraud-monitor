/**
 * Implementações locais dos métodos estatísticos usados pelo dashboard.
 *
 * Elas permitem que o sandbox de detecção funcione mesmo sem a API no ar e
 * espelham a semântica de `backend/drift/*.py`:
 * - PSI por quantis da referência;
 * - KS bilateral + p-valor assintótico;
 * - Jensen-Shannon como distância (sqrt da divergência, base 2);
 * - Wasserstein normalizado pelo desvio-padrão da referência.
 */
import {
  DriftThresholds,
  FeatureDriftRow,
  MethodDetail,
  MethodKey,
  Severity,
  ThresholdDirection,
} from '@/types';
import { clamp, round } from '@/lib/utils';

const EPSILON = 1e-6;

export function classifyValue(
  rule: { warning: number; critical: number; direction: ThresholdDirection },
  value: number | null | undefined,
): Severity {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'none';
  if (rule.direction === 'below') {
    if (value <= rule.critical) return 'critical';
    if (value <= rule.warning) return 'warning';
    return 'none';
  }
  if (value >= rule.critical) return 'critical';
  if (value >= rule.warning) return 'warning';
  return 'none';
}

function maxSeverity(severities: Severity[]): Severity {
  const order: Record<Severity, number> = { none: 0, warning: 1, critical: 2 };
  return severities.reduce<Severity>(
    (acc, current) => (order[current] > order[acc] ? current : acc),
    'none',
  );
}

function isAtLeast(severity: Severity, minimum: Severity): boolean {
  const order: Record<Severity, number> = { none: 0, warning: 1, critical: 2 };
  return order[severity] >= order[minimum];
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function calculatePSI(
  reference: number[],
  current: number[],
  bins = 10,
): number {
  const ref = reference.filter(Number.isFinite);
  const cur = current.filter(Number.isFinite);
  if (ref.length < 2 || cur.length < 2) return 0;

  const sorted = [...ref].sort((a, b) => a - b);
  const edges: number[] = [Number.NEGATIVE_INFINITY];
  for (let i = 1; i < bins; i += 1) {
    const edge = quantile(sorted, i / bins);
    if (edge > edges[edges.length - 1]) edges.push(edge);
  }
  edges.push(Number.POSITIVE_INFINITY);

  if (edges.length < 3) {
    // Referência constante/duplicada: usa faixas ao redor do valor.
    const base = sorted[Math.floor(sorted.length / 2)];
    edges.splice(0, edges.length, Number.NEGATIVE_INFINITY, base - 1e-9, base + 1e-9, Number.POSITIVE_INFINITY);
  }

  const refCounts = new Array(edges.length - 1).fill(0);
  const curCounts = new Array(edges.length - 1).fill(0);

  for (const value of ref) {
    for (let i = 0; i < edges.length - 1; i += 1) {
      if (value > edges[i] && value <= edges[i + 1]) {
        refCounts[i] += 1;
        break;
      }
    }
  }
  for (const value of cur) {
    for (let i = 0; i < edges.length - 1; i += 1) {
      if (value > edges[i] && value <= edges[i + 1]) {
        curCounts[i] += 1;
        break;
      }
    }
  }

  let psi = 0;
  for (let i = 0; i < refCounts.length; i += 1) {
    const p = Math.max(refCounts[i] / ref.length, EPSILON);
    const q = Math.max(curCounts[i] / cur.length, EPSILON);
    psi += (q - p) * Math.log(q / p);
  }
  return Math.max(0, psi);
}

export function calculateKS(
  reference: number[],
  current: number[],
): { statistic: number; pValue: number } {
  const ref = [...reference.filter(Number.isFinite)].sort((a, b) => a - b);
  const cur = [...current.filter(Number.isFinite)].sort((a, b) => a - b);
  if (ref.length < 2 || cur.length < 2) return { statistic: 0, pValue: 1 };

  let i = 0;
  let j = 0;
  let statistic = 0;
  while (i < ref.length && j < cur.length) {
    if (ref[i] <= cur[j]) {
      const value = ref[i];
      while (i < ref.length && ref[i] === value) i += 1;
    } else {
      const value = cur[j];
      while (j < cur.length && cur[j] === value) j += 1;
    }
    statistic = Math.max(statistic, Math.abs(i / ref.length - j / cur.length));
  }

  const n = ref.length;
  const m = cur.length;
  const effective = Math.sqrt((n * m) / (n + m));
  const lambda = (effective + 0.12 + 0.11 / effective) * statistic;
  let pValue = 1;
  if (lambda > 1e-9) {
    let sum = 0;
    for (let k = 1; k <= 100; k += 1) {
      sum += (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    }
    pValue = clamp(2 * sum, 0, 1);
  }
  return { statistic, pValue };
}

function histogram(
  values: number[],
  min: number,
  max: number,
  bins: number,
): number[] {
  const counts = new Array(bins).fill(0);
  if (max <= min) {
    counts[Math.floor(bins / 2)] = values.length;
    return counts;
  }
  const width = (max - min) / bins;
  for (const value of values) {
    const index = clamp(Math.floor((value - min) / width), 0, bins - 1);
    counts[index] += 1;
  }
  return counts;
}

export function calculateJS(
  reference: number[],
  current: number[],
  bins = 10,
): number {
  const ref = reference.filter(Number.isFinite);
  const cur = current.filter(Number.isFinite);
  if (ref.length < 2 || cur.length < 2) return 0;

  const min = Math.min(...ref, ...cur);
  const max = Math.max(...ref, ...cur);
  const refCounts = histogram(ref, min, max, bins);
  const curCounts = histogram(cur, min, max, bins);

  let divergence = 0;
  for (let i = 0; i < bins; i += 1) {
    const p = Math.max(refCounts[i] / ref.length, EPSILON);
    const q = Math.max(curCounts[i] / cur.length, EPSILON);
    const m = (p + q) / 2;
    divergence += 0.5 * p * Math.log2(p / m) + 0.5 * q * Math.log2(q / m);
  }
  // Correção de viés do estimador plug-in (equivalente ao backend).
  const bias = ((bins - 1) / 4) * (1 / ref.length + 1 / cur.length);
  divergence = Math.max(0, divergence - bias);
  return Math.sqrt(divergence);
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateWasserstein(
  reference: number[],
  current: number[],
): { raw: number; normalized: number } {
  const ref = [...reference.filter(Number.isFinite)].sort((a, b) => a - b);
  const cur = [...current.filter(Number.isFinite)].sort((a, b) => a - b);
  if (ref.length < 2 || cur.length < 2) return { raw: 0, normalized: 0 };

  const points = 200;
  let distance = 0;
  for (let i = 0; i < points; i += 1) {
    const q = i / (points - 1);
    distance += Math.abs(quantile(ref, q) - quantile(cur, q));
  }
  const raw = distance / points;
  const scale = standardDeviation(ref);
  const normalized = scale > 0 ? raw / scale : raw;
  return { raw, normalized };
}

function buildMethodDetail(
  method: MethodKey,
  thresholds: DriftThresholds,
  value: number | null,
  statistic: number | null,
  available = true,
  reason?: string,
): MethodDetail {
  const rule = thresholds[method];
  const severity = available ? classifyValue(rule, value) : 'none';
  return {
    available,
    value: value === null ? null : round(value, 6),
    statistic: statistic === null ? null : round(statistic, 6),
    threshold: rule.critical,
    warningThreshold: rule.warning,
    direction: rule.direction,
    severity,
    isDrift: available && isAtLeast(severity, thresholds.trigger_severity),
    ...(reason ? { reason } : {}),
  };
}

export function calculateFeatureDrift(
  reference: number[],
  current: number[],
  thresholds: DriftThresholds,
  options: { featureName?: string; categorical?: boolean } = {},
): FeatureDriftRow {
  const featureName = options.featureName ?? 'feature';
  const categorical = options.categorical ?? false;

  if (categorical) {
    return buildCategoricalRow(reference, current, thresholds, featureName);
  }

  const psi = calculatePSI(reference, current, thresholds.psi_bins);
  const ks = calculateKS(reference, current);
  const js = calculateJS(reference, current, thresholds.js_bins);
  const wasserstein = calculateWasserstein(reference, current);

  const methods: Record<MethodKey, MethodDetail> = {
    psi: buildMethodDetail('psi', thresholds, psi, psi),
    ks: buildMethodDetail('ks', thresholds, ks.pValue, ks.statistic),
    js: buildMethodDetail('js', thresholds, js, js),
    wasserstein: buildMethodDetail(
      'wasserstein',
      thresholds,
      wasserstein.normalized,
      wasserstein.raw,
    ),
  };

  const severity = maxSeverity(Object.values(methods).map((method) => method.severity));
  const isDrift = Object.values(methods).some((method) => method.isDrift);

  const driftScore = round(
    Math.max(
      psi / Math.max(thresholds.psi.critical, EPSILON),
      js / Math.max(thresholds.js.critical, EPSILON),
      wasserstein.normalized / Math.max(thresholds.wasserstein.critical, EPSILON),
      ks.pValue <= thresholds.ks.warning
        ? (thresholds.ks.warning / Math.max(ks.pValue, 1e-9)) * 0.5
        : 0,
    ),
    4,
  );

  return {
    name: featureName,
    type: 'numeric',
    nReference: reference.length,
    nCurrent: current.length,
    psi: round(psi, 6),
    ksStat: round(ks.statistic, 6),
    ksPvalue: round(ks.pValue, 6),
    js: round(js, 6),
    wasserstein: round(wasserstein.raw, 6),
    wassersteinNormalized: round(wasserstein.normalized, 6),
    driftScore,
    severity,
    isDrift,
    insufficientData:
      reference.length < thresholds.min_samples || current.length < thresholds.min_samples,
    methods,
    warnings: [],
  };
}

/**
 * Para variáveis categóricas, PSI e JS usam frequências; KS e Wasserstein
 * não são aplicáveis (mesma regra do backend).
 */
function buildCategoricalRow(
  reference: number[],
  current: number[],
  thresholds: DriftThresholds,
  featureName: string,
): FeatureDriftRow {
  // Valores numéricos são usados como códigos de categoria no sandbox.
  const categories = Array.from(new Set([...reference, ...current]));
  const refCounts = categories.map(
    (category) => reference.filter((value) => value === category).length,
  );
  const curCounts = categories.map(
    (category) => current.filter((value) => value === category).length,
  );
  const refTotal = Math.max(reference.length, 1);
  const curTotal = Math.max(current.length, 1);

  let psi = 0;
  let jsDivergence = 0;
  for (let i = 0; i < categories.length; i += 1) {
    const p = Math.max(refCounts[i] / refTotal, EPSILON);
    const q = Math.max(curCounts[i] / curTotal, EPSILON);
    psi += (q - p) * Math.log(q / p);
    const m = (p + q) / 2;
    jsDivergence += 0.5 * p * Math.log2(p / m) + 0.5 * q * Math.log2(q / m);
  }
  const js = Math.sqrt(Math.max(0, jsDivergence));

  const methods: Record<MethodKey, MethodDetail> = {
    psi: buildMethodDetail('psi', thresholds, psi, psi),
    ks: buildMethodDetail('ks', thresholds, null, null, false, 'Não aplicável a variáveis categóricas'),
    js: buildMethodDetail('js', thresholds, js, js),
    wasserstein: buildMethodDetail(
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
    name: featureName,
    type: 'categorical',
    nReference: reference.length,
    nCurrent: current.length,
    psi: round(psi, 6),
    ksStat: null,
    ksPvalue: null,
    js: round(js, 6),
    wasserstein: null,
    wassersteinNormalized: null,
    driftScore: round(
      Math.max(
        psi / Math.max(thresholds.psi.critical, EPSILON),
        js / Math.max(thresholds.js.critical, EPSILON),
      ),
      4,
    ),
    severity,
    isDrift: methods.psi.isDrift || methods.js.isDrift,
    insufficientData:
      reference.length < thresholds.min_samples || current.length < thresholds.min_samples,
    methods,
    warnings: ['KS e Wasserstein não são calculados para variáveis categóricas.'],
  };
}

export function parseValues(input: string): number[] {
  return input
    .split(/[\s,;\n\t]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number(token.replace(',', '.')))
    .filter((value) => Number.isFinite(value));
}

export function methodValueLabel(method: MethodKey, value: number | null): string {
  if (value === null) return '—';
  if (method === 'ks') {
    if (value < 0.001) return value.toExponential(2);
    return value.toFixed(4);
  }
  return value.toFixed(3);
}
