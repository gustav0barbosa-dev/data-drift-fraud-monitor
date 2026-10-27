// ============================================================
// Tipos compartilhados do frontend
// ============================================================

export type Severity = 'none' | 'warning' | 'critical';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type DriftLevel = 'none' | 'low' | 'moderate' | 'high';
export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed';
export type MethodKey = 'psi' | 'ks' | 'js' | 'wasserstein';
export type ThresholdDirection = 'above' | 'below';
export type DataSource = 'live' | 'demo';
export type ThemeMode = 'dark' | 'light' | 'system';

// ------------------------------------------------------------
// Experimentos
// ------------------------------------------------------------
export interface Experiment {
  id: number;
  name: string;
  description: string | null;
  drift_level: DriftLevel;
  status: ExperimentStatus;
  config: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentListResponse {
  items: Experiment[];
  total: number;
  skip: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ExperimentCreatePayload {
  name: string;
  description?: string;
  drift_level: DriftLevel;
  config?: Record<string, unknown>;
}

// ------------------------------------------------------------
// Limiares e métodos
// ------------------------------------------------------------
export interface ThresholdRule {
  warning: number;
  critical: number;
  direction: ThresholdDirection;
}

export interface DriftThresholds {
  psi: ThresholdRule;
  ks: ThresholdRule;
  js: ThresholdRule;
  wasserstein: ThresholdRule;
  trigger_severity: Severity;
  min_samples: number;
  psi_bins: number;
  js_bins: number;
}

export interface MethodDetail {
  available: boolean;
  value: number | null;
  statistic: number | null;
  threshold: number | null;
  warningThreshold: number | null;
  direction: ThresholdDirection | null;
  severity: Severity;
  isDrift: boolean;
  reason?: string;
}

export interface FeatureDriftRow {
  name: string;
  type: 'numeric' | 'categorical';
  nReference: number;
  nCurrent: number;
  psi: number | null;
  ksStat: number | null;
  ksPvalue: number | null;
  js: number | null;
  wasserstein: number | null;
  wassersteinNormalized: number | null;
  driftScore: number;
  severity: Severity;
  isDrift: boolean;
  insufficientData: boolean;
  methods: Record<MethodKey, MethodDetail>;
  warnings: string[];
}

// ------------------------------------------------------------
// Métricas persistidas / resumo
// ------------------------------------------------------------
export interface DriftMetric {
  id: number;
  experiment_id: number;
  window_start: string;
  window_end: string;
  feature_name: string;
  psi_value: number | null;
  ks_value: number | null;
  ks_pvalue: number | null;
  js_value: number | null;
  wasserstein_value: number | null;
  threshold: number;
  is_drift: boolean;
  created_at: string;
}

export interface DriftSummary {
  experiment_id: number;
  total_metrics: number;
  total_features: number;
  drifted_features: string[];
  max_psi: number;
  max_ks: number;
  max_js: number;
  max_wasserstein: number;
  last_window_end: string | null;
}

export type DriftDetectionMethod = 'psi' | 'ks' | 'js' | 'wasserstein';

export interface FeatureDriftRequest {
  feature_name?: string;
  reference: number[];
  current: number[];
  methods?: DriftDetectionMethod[];
  categorical?: boolean;
  thresholds?: Partial<DriftThresholds>;
}

export interface FeatureDriftApiResponse {
  feature_name: string | null;
  n_reference: number;
  n_current: number;
  categorical: boolean;
  insufficient_data: boolean;
  methods: Record<
    string,
    {
      available: boolean;
      value: number | null;
      statistic: number | null;
      raw_value: number | null;
      threshold: number | null;
      warning_threshold: number | null;
      direction: ThresholdDirection | null;
      severity: Severity;
      is_drift: boolean;
      reason?: string | null;
    }
  >;
  psi: number | null;
  ks_stat: number | null;
  ks_pvalue: number | null;
  js: number | null;
  wasserstein: number | null;
  wasserstein_normalized: number | null;
  severity: Severity;
  is_drift: boolean;
  drift_score: number;
  warnings: string[];
}

// ------------------------------------------------------------
// Alertas
// ------------------------------------------------------------
export interface Alert {
  id: number;
  experimentId: number;
  modelVersionId: number | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  metadata: Record<string, unknown>;
  triggeredAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
}

export interface AlertListResponse {
  items: Alert[];
  total: number;
  skip: number;
  limit: number;
}

// ------------------------------------------------------------
// Performance / modelo
// ------------------------------------------------------------
export interface PerformancePoint {
  id: number;
  modelVersionId: number;
  label?: string;
  windowStart: string;
  windowEnd: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
}

export interface PerformanceApiResponse {
  id: number;
  model_version_id: number;
  window_start: string;
  window_end: string;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  auc_roc: number | null;
  total_predictions: number;
  true_positives: number;
  false_positives: number;
  true_negatives: number;
  false_negatives: number;
  created_at: string;
}

export interface PerformanceSummary {
  experiment_id: number;
  versions: { version: string; avg_f1: number; trained_at: string | null }[];
  best_f1: number;
  worst_f1: number;
  degradation: number;
}

export interface ModelInfo {
  version: string;
  modelType: string;
  modelPath: string;
  isActive: boolean;
  trainedAt: string;
  dataset: string;
  samples: number;
  features: number;
  fraudRate: number;
  hyperparameters: Record<string, number | string>;
  trainingMetrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    aucRoc: number;
    prAuc: number;
  };
  featureImportance: { feature: string; importance: number }[];
}

export interface ModelVersionApiResponse {
  id: number;
  experiment_id: number;
  version: string;
  model_path: string;
  model_type: string;
  hyperparameters: Record<string, unknown>;
  training_metrics: Record<string, unknown>;
  trained_at: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface ModelVersionListApiResponse {
  items: ModelVersionApiResponse[];
  total: number;
  active: ModelVersionApiResponse | null;
}

export interface ScenarioPerformance {
  level: DriftLevel;
  label: string;
  description: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
}

export interface RetrainRecord {
  id: number;
  experimentId: number;
  type: 'retrain_triggered' | 'retrain_completed' | 'retrain_failed';
  severity: AlertSeverity;
  message: string;
  reason: string;
  status: 'running' | 'completed' | 'failed';
  triggeredAt: string;
  version?: string;
  f1Before?: number;
  f1After?: number;
}

export interface RetrainResponse {
  experiment_id: number;
  status: string;
  message: string;
  triggered_at: string;
}

export interface HealthResponse {
  status: string;
  timestamp: number;
  components: {
    database: string;
    api: string;
    model: string;
  };
  version: string;
}

export interface DriftTimelinePoint {
  window: string;
  label: string;
  date: string;
  psi: number;
  js: number;
  ks: number;
  drifted: number;
  maxScore: number;
}

export interface DistributionPoint {
  label: string;
  reference: number;
  current: number;
}

export interface CategoricalDistribution {
  label: string;
  reference: number;
  current: number;
}

// ------------------------------------------------------------
// E3 — comparação de métodos
// ------------------------------------------------------------
export interface E3MethodSummary {
  key: MethodKey;
  label: string;
  auc: number;
  aucLower: number;
  aucUpper: number;
  sensitivity: number;
  specificity: number;
  precision: number;
  f1: number;
  mcc: number;
  falsePositiveRate: number;
  latencyMean: number;
}

export interface E3ScenarioDetection {
  scenario: DriftLevel;
  label: string;
  psi: number;
  ks: number;
  js: number;
  wasserstein: number;
}

export interface E3LatencyPoint {
  window: number;
  psi: number;
  ks: number;
  js: number;
  wasserstein: number;
}

export interface E3Pairwise {
  pair: string;
  kappa: number;
  agreement: number;
  pValue: number;
  accuracyDiff: number;
}

export interface E3Data {
  generatedAt: string;
  repetitions: number;
  nReference: number;
  nCurrent: number;
  methods: E3MethodSummary[];
  detectionByScenario: E3ScenarioDetection[];
  latency: Record<'low' | 'moderate' | 'high', E3LatencyPoint[]>;
  pairwise: E3Pairwise[];
  ranking: {
    byAuc: MethodKey[];
    bySensitivity: MethodKey[];
    byFalsePositiveRate: MethodKey[];
    byLatency: MethodKey[];
  };
}

// ------------------------------------------------------------
// Simulador
// ------------------------------------------------------------
export interface SimulatorWindow extends PerformancePoint {
  label: string;
  driftLevel: DriftLevel;
  driftIntensity: number;
}

// ------------------------------------------------------------
// Configurações locais
// ------------------------------------------------------------
export interface AppSettings {
  apiUrl: string;
  theme: ThemeMode;
  pollInterval: number;
  forceDemo: boolean;
  compact: boolean;
  timeout: number;
}

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: 'success' | 'error' | 'info' | 'warning';
}
