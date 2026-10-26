import { E3Data, E3LatencyPoint } from '@/types';

/**
 * Resultados consolidados do experimento E3 (Pessoa 2).
 * Fonte: backend/experiments/results/e3/e3_results.json — 200 repetições,
 * n_ref=1000, n_cur=500, seed=42. Mantidos aqui para visualização no
 * dashboard mesmo quando a API está offline.
 */

const latencyLow: E3LatencyPoint[] = [
  { window: 1, psi: 0, ks: 0.04, js: 0, wasserstein: 0 },
  { window: 2, psi: 0, ks: 0.2, js: 0, wasserstein: 0 },
  { window: 3, psi: 0, ks: 0.42, js: 0, wasserstein: 0 },
  { window: 4, psi: 0, ks: 0.6, js: 0, wasserstein: 0.08 },
  { window: 5, psi: 0, ks: 0.88, js: 0, wasserstein: 0.26 },
  { window: 6, psi: 0, ks: 0.94, js: 0, wasserstein: 0.4 },
  { window: 7, psi: 0, ks: 0.94, js: 0, wasserstein: 0.48 },
  { window: 8, psi: 0, ks: 0.98, js: 0.02, wasserstein: 0.56 },
  { window: 9, psi: 0, ks: 1, js: 0.02, wasserstein: 0.62 },
  { window: 10, psi: 0, ks: 1, js: 0.04, wasserstein: 0.68 },
  { window: 11, psi: 0, ks: 1, js: 0.06, wasserstein: 0.7 },
  { window: 12, psi: 0, ks: 1, js: 0.08, wasserstein: 0.76 },
];

const latencyModerate: E3LatencyPoint[] = [
  { window: 1, psi: 0, ks: 0.3, js: 0, wasserstein: 0.02 },
  { window: 2, psi: 0, ks: 0.8, js: 0.02, wasserstein: 0.2 },
  { window: 3, psi: 0.04, ks: 1, js: 0.3, wasserstein: 0.88 },
  { window: 4, psi: 0.14, ks: 1, js: 0.9, wasserstein: 1 },
  { window: 5, psi: 0.62, ks: 1, js: 1, wasserstein: 1 },
  { window: 6, psi: 0.88, ks: 1, js: 1, wasserstein: 1 },
  { window: 7, psi: 0.98, ks: 1, js: 1, wasserstein: 1 },
  { window: 8, psi: 0.98, ks: 1, js: 1, wasserstein: 1 },
  { window: 9, psi: 0.98, ks: 1, js: 1, wasserstein: 1 },
  { window: 10, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 11, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 12, psi: 1, ks: 1, js: 1, wasserstein: 1 },
];

const latencyHigh: E3LatencyPoint[] = [
  { window: 1, psi: 0, ks: 0.84, js: 0.06, wasserstein: 0.34 },
  { window: 2, psi: 0.14, ks: 1, js: 0.82, wasserstein: 0.98 },
  { window: 3, psi: 0.94, ks: 1, js: 1, wasserstein: 1 },
  { window: 4, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 5, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 6, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 7, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 8, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 9, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 10, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 11, psi: 1, ks: 1, js: 1, wasserstein: 1 },
  { window: 12, psi: 1, ks: 1, js: 1, wasserstein: 1 },
];

export const E3_DATA: E3Data = {
  generatedAt: '2026-10-23T13:23:03.084868+00:00',
  repetitions: 200,
  nReference: 1000,
  nCurrent: 500,
  methods: [
    {
      key: 'wasserstein',
      label: 'Wasserstein',
      auc: 0.9956,
      aucLower: 0.9924,
      aucUpper: 0.9981,
      sensitivity: 0.7283,
      specificity: 1,
      precision: 1,
      f1: 0.8428,
      mcc: 0.6335,
      falsePositiveRate: 0,
      latencyMean: 2.9,
    },
    {
      key: 'ks',
      label: 'KS',
      auc: 0.9915,
      aucLower: 0.987,
      aucUpper: 0.9954,
      sensitivity: 0.9517,
      specificity: 0.945,
      precision: 0.9811,
      f1: 0.9662,
      mcc: 0.872,
      falsePositiveRate: 0.055,
      latencyMean: 1.9,
    },
    {
      key: 'psi',
      label: 'PSI',
      auc: 0.9791,
      aucLower: 0.9713,
      aucUpper: 0.9867,
      sensitivity: 0.5317,
      specificity: 1,
      precision: 1,
      f1: 0.6942,
      mcc: 0.4702,
      falsePositiveRate: 0,
      latencyMean: 5.38,
    },
    {
      key: 'js',
      label: 'Jensen-Shannon',
      auc: 0.94,
      aucLower: 0.9262,
      aucUpper: 0.9525,
      sensitivity: 0.6733,
      specificity: 1,
      precision: 1,
      f1: 0.8048,
      mcc: 0.5832,
      falsePositiveRate: 0,
      latencyMean: 3.78,
    },
  ],
  detectionByScenario: [
    { scenario: 'none', label: 'Sem drift', psi: 0, ks: 0.055, js: 0, wasserstein: 0 },
    { scenario: 'low', label: 'Drift baixo', psi: 0, ks: 0.855, js: 0.02, wasserstein: 0.185 },
    {
      scenario: 'moderate',
      label: 'Drift moderado',
      psi: 0.595,
      ks: 1,
      js: 1,
      wasserstein: 1,
    },
    { scenario: 'high', label: 'Drift forte', psi: 1, ks: 1, js: 1, wasserstein: 1 },
  ],
  latency: {
    low: latencyLow,
    moderate: latencyModerate,
    high: latencyHigh,
  },
  pairwise: [
    { pair: 'PSI × KS', kappa: 0.398, agreement: 0.6713, pValue: 1.49e-49, accuracyDiff: -0.3013 },
    { pair: 'PSI × JS', kappa: 0.7879, agreement: 0.8938, pValue: 8.16e-20, accuracyDiff: -0.1063 },
    { pair: 'PSI × W₁', kappa: 0.7104, agreement: 0.8525, pValue: 4.73e-27, accuracyDiff: -0.1475 },
    { pair: 'KS × JS', kappa: 0.553, agreement: 0.7775, pValue: 3.35e-31, accuracyDiff: 0.195 },
    { pair: 'KS × W₁', kappa: 0.6216, agreement: 0.8188, pValue: 4e-24, accuracyDiff: 0.1538 },
    { pair: 'JS × W₁', kappa: 0.9174, agreement: 0.9588, pValue: 2.54e-8, accuracyDiff: -0.0413 },
  ],
  ranking: {
    byAuc: ['wasserstein', 'ks', 'psi', 'js'],
    bySensitivity: ['ks', 'wasserstein', 'js', 'psi'],
    byFalsePositiveRate: ['psi', 'js', 'wasserstein', 'ks'],
    byLatency: ['ks', 'wasserstein', 'js', 'psi'],
  },
};

export const E3_INSIGHTS = [
  {
    title: 'Maior AUC',
    value: 'Wasserstein',
    detail: '0,996 · IC 95% [0,992; 0,998]',
    tone: 'brand' as const,
  },
  {
    title: 'Mais sensível a drift baixo',
    value: 'KS',
    detail: '85,5% de detecção em 0,2σ',
    tone: 'info' as const,
  },
  {
    title: 'Menor falso positivo',
    value: 'PSI',
    detail: '0% no cenário sem drift (JS e W₁ também)',
    tone: 'warn' as const,
  },
  {
    title: 'Detecção mais rápida',
    value: 'KS',
    detail: 'mediana de 1 janela no drift forte',
    tone: 'brand' as const,
  },
];

export const E3_METHOD_COLORS: Record<string, string> = {
  psi: '#34d399',
  ks: '#38bdf8',
  js: '#fbbf24',
  wasserstein: '#c084fc',
};
