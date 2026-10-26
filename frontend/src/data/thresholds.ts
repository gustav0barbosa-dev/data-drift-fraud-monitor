import { DriftLevel, DriftThresholds, ScenarioPerformance } from '@/types';

export const DEFAULT_THRESHOLDS: DriftThresholds = {
  psi: { warning: 0.1, critical: 0.25, direction: 'above' },
  ks: { warning: 0.1, critical: 0.05, direction: 'below' },
  js: { warning: 0.05, critical: 0.1, direction: 'above' },
  wasserstein: { warning: 0.1, critical: 0.25, direction: 'above' },
  trigger_severity: 'critical',
  min_samples: 30,
  psi_bins: 10,
  js_bins: 10,
};

export function cloneThresholds(thresholds: DriftThresholds): DriftThresholds {
  return {
    psi: { ...thresholds.psi },
    ks: { ...thresholds.ks },
    js: { ...thresholds.js },
    wasserstein: { ...thresholds.wasserstein },
    trigger_severity: thresholds.trigger_severity,
    min_samples: thresholds.min_samples,
    psi_bins: thresholds.psi_bins,
    js_bins: thresholds.js_bins,
  };
}

export const DRIFT_LEVELS: DriftLevel[] = ['none', 'low', 'moderate', 'high'];

export const SCENARIO_PERFORMANCE: ScenarioPerformance[] = [
  {
    level: 'none',
    label: 'Sem drift',
    description: 'Controle · 0,0σ',
    accuracy: 0.9968,
    precision: 0.951,
    recall: 0.874,
    f1: 0.911,
    aucRoc: 0.981,
  },
  {
    level: 'low',
    label: 'Drift baixo',
    description: '0,2σ + 5% escala',
    accuracy: 0.9931,
    precision: 0.926,
    recall: 0.841,
    f1: 0.881,
    aucRoc: 0.966,
  },
  {
    level: 'moderate',
    label: 'Drift moderado',
    description: '0,5σ + 20% escala',
    accuracy: 0.9762,
    precision: 0.847,
    recall: 0.748,
    f1: 0.794,
    aucRoc: 0.923,
  },
  {
    level: 'high',
    label: 'Drift forte',
    description: '1,0σ + 50% escala',
    accuracy: 0.9347,
    precision: 0.702,
    recall: 0.587,
    f1: 0.639,
    aucRoc: 0.846,
  },
];

export const THRESHOLD_HELP: Record<
  'psi' | 'ks' | 'js' | 'wasserstein',
  { warning: string; critical: string; note: string }
> = {
  psi: {
    warning: '0,10',
    critical: '0,25',
    note: 'Abaixo de 0,10 a população é estável; acima de 0,25 há mudança significativa.',
  },
  ks: {
    warning: '0,10',
    critical: '0,05',
    note: 'A decisão usa o p-valor: abaixo de 0,05 rejeita-se H₀ (mesma distribuição).',
  },
  js: {
    warning: '0,05',
    critical: '0,10',
    note: 'Distância na escala 0–1; 0,10 indica mudança forte na forma da distribuição.',
  },
  wasserstein: {
    warning: '0,10',
    critical: '0,25',
    note: 'Valor normalizado pelo desvio-padrão da referência para comparar features.',
  },
};

export const PERSONAS = {
  p1: {
    name: 'Pessoa 1',
    role: 'ML & Dados',
    color: 'brand',
    responsibilities: [
      'Dataset PaySim e engenharia de features',
      'Modelo baseline XGBoost',
      'Simulador temporal e cenários de drift',
      'Retreinamento orientado por alertas',
    ],
  },
  p2: {
    name: 'Pessoa 2',
    role: 'Drift & Estatística',
    color: 'info',
    responsibilities: [
      'PSI, KS, Jensen-Shannon e Wasserstein',
      'Limiares e sistema de alertas',
      'Sensibilidade dos métodos (E3)',
      'Análise estatística dos resultados',
    ],
  },
  p3: {
    name: 'Pessoa 3',
    role: 'Software & Fullstack',
    color: 'warn',
    responsibilities: [
      'API REST e banco PostgreSQL',
      'Dashboard React/Next.js',
      'Gráficos, alertas e integração',
      'Docker e documentação técnica',
    ],
  },
} as const;
