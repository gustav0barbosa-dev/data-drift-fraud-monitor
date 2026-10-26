import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  Alert,
  AlertListResponse,
  DriftMetric,
  DriftSummary,
  DriftThresholds,
  Experiment,
  ExperimentCreatePayload,
  ExperimentListResponse,
  ExperimentStatus,
  FeatureDriftApiResponse,
  FeatureDriftRequest,
  HealthResponse,
  PerformanceApiResponse,
  PerformancePoint,
  PerformanceSummary,
  RetrainRecord,
  RetrainResponse,
} from '@/types';

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

let apiBaseUrl = DEFAULT_API_URL;
let timeoutMs = 5000;

export function configureApi(options: { baseUrl?: string; timeout?: number }): void {
  if (options.baseUrl) apiBaseUrl = options.baseUrl.replace(/\/$/, '');
  if (options.timeout && options.timeout > 0) timeoutMs = options.timeout;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: apiBaseUrl,
    timeout: Math.min(timeoutMs, 15000),
    headers: { 'Content-Type': 'application/json' },
  });
}

export class ApiError extends Error {
  status?: number;
  detail?: unknown;

  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; detail?: unknown }>;
    if (axiosError.code === 'ECONNABORTED') {
      return 'Tempo de resposta excedido. Verifique se a API está em execução.';
    }
    if (!axiosError.response) {
      return 'Não foi possível conectar à API. Exibindo dados de demonstração.';
    }
    const payload = axiosError.response.data;
    if (payload && typeof payload === 'object' && typeof payload.message === 'string') {
      return payload.message;
    }
    return `A API respondeu com status ${axiosError.response.status}.`;
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Erro inesperado ao consultar a API.';
}

export function isConnectionError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

// ============================================================
// Normalizadores
// ============================================================
function normalizeAlert(raw: Record<string, unknown>): Alert {
  return {
    id: Number(raw.id),
    experimentId: Number(raw.experiment_id ?? raw.experimentId ?? 0),
    modelVersionId:
      raw.model_version_id === null || raw.model_version_id === undefined
        ? null
        : Number(raw.model_version_id),
    type: String(raw.alert_type ?? raw.type ?? 'drift_detected'),
    severity: (raw.severity as Alert['severity']) ?? 'info',
    message: String(raw.message ?? ''),
    metadata:
      (raw.metadata as Record<string, unknown>) ??
      (raw.metadata_json as Record<string, unknown>) ??
      {},
    triggeredAt: String(raw.triggered_at ?? raw.triggeredAt ?? new Date().toISOString()),
    isResolved: Boolean(raw.is_resolved ?? raw.isResolved ?? false),
    resolvedAt:
      raw.resolved_at || raw.resolvedAt
        ? String(raw.resolved_at ?? raw.resolvedAt)
        : null,
  };
}

function normalizeAlertList(raw: Record<string, unknown>): AlertListResponse {
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items: items.map((item) => normalizeAlert(item as Record<string, unknown>)),
    total: Number(raw.total ?? items.length),
    skip: Number(raw.skip ?? 0),
    limit: Number(raw.limit ?? items.length),
  };
}

function normalizePerformance(raw: PerformanceApiResponse): PerformancePoint {
  return {
    id: raw.id,
    modelVersionId: raw.model_version_id,
    windowStart: raw.window_start,
    windowEnd: raw.window_end,
    accuracy: raw.accuracy ?? 0,
    precision: raw.precision ?? 0,
    recall: raw.recall ?? 0,
    f1: raw.f1_score ?? 0,
    aucRoc: raw.auc_roc ?? 0,
    totalPredictions: raw.total_predictions ?? 0,
    truePositives: raw.true_positives ?? 0,
    falsePositives: raw.false_positives ?? 0,
    trueNegatives: raw.true_negatives ?? 0,
    falseNegatives: raw.false_negatives ?? 0,
  };
}

// ============================================================
// API
// ============================================================
export const api = {
  async health(): Promise<HealthResponse> {
    const client = createClient();
    const { data } = await client.get<HealthResponse>('/health', { timeout: 3500 });
    return data;
  },

  async root(): Promise<Record<string, unknown>> {
    const client = createClient();
    const { data } = await client.get('/');
    return data;
  },

  experiments: {
    async list(params: {
      status?: string;
      drift_level?: string;
      search?: string;
      skip?: number;
      limit?: number;
    } = {}): Promise<ExperimentListResponse> {
      const client = createClient();
      const { data } = await client.get<ExperimentListResponse>('/api/v1/experiments/', {
        params,
      });
      return data;
    },

    async get(id: number): Promise<Experiment> {
      const client = createClient();
      const { data } = await client.get<Experiment>(`/api/v1/experiments/${id}`);
      return data;
    },

    async create(payload: ExperimentCreatePayload): Promise<Experiment> {
      const client = createClient();
      const { data } = await client.post<Experiment>('/api/v1/experiments/', payload);
      return data;
    },

    async update(id: number, payload: Record<string, unknown>): Promise<Experiment> {
      const client = createClient();
      const { data } = await client.patch<Experiment>(
        `/api/v1/experiments/${id}`,
        payload,
      );
      return data;
    },

    async remove(id: number): Promise<void> {
      const client = createClient();
      await client.delete(`/api/v1/experiments/${id}`);
    },

    async start(id: number): Promise<Experiment> {
      const client = createClient();
      const { data } = await client.post<Experiment>(
        `/api/v1/experiments/${id}/start`,
      );
      return data;
    },

    async complete(id: number): Promise<Experiment> {
      const client = createClient();
      const { data } = await client.post<Experiment>(
        `/api/v1/experiments/${id}/complete`,
      );
      return data;
    },

    async setStatus(id: number, status: ExperimentStatus): Promise<Experiment> {
      if (status === 'running') return api.experiments.start(id);
      if (status === 'completed') return api.experiments.complete(id);
      return api.experiments.update(id, { status });
    },
  },

  drift: {
    async metrics(
      experimentId: number,
      params: { feature?: string; only_drift?: boolean; skip?: number; limit?: number } = {},
    ): Promise<DriftMetric[]> {
      const client = createClient();
      const { data } = await client.get<DriftMetric[]>(
        `/api/v1/drift/metrics/${experimentId}`,
        { params: { limit: 500, ...params } },
      );
      return data;
    },

    async summary(experimentId: number): Promise<DriftSummary> {
      const client = createClient();
      const { data } = await client.get<DriftSummary>(
        `/api/v1/drift/metrics/${experimentId}/summary`,
      );
      return data;
    },

    async thresholds(): Promise<DriftThresholds> {
      const client = createClient();
      const { data } = await client.get<DriftThresholds>('/api/v1/drift/thresholds');
      return data;
    },

    async alerts(
      experimentId: number,
      includeResolved = false,
    ): Promise<AlertListResponse> {
      const client = createClient();
      const { data } = await client.get<Record<string, unknown>>(
        `/api/v1/drift/alerts/${experimentId}`,
        { params: { include_resolved: includeResolved, limit: 200 } },
      );
      return normalizeAlertList(data);
    },

    async resolveAlert(alertId: number, resolved = true): Promise<Alert> {
      const client = createClient();
      const { data } = await client.patch<Record<string, unknown>>(
        `/api/v1/drift/alerts/${alertId}/resolve`,
        { resolved },
      );
      return normalizeAlert(data);
    },

    async detectFeature(payload: FeatureDriftRequest): Promise<FeatureDriftApiResponse> {
      const client = createClient();
      const { data } = await client.post<FeatureDriftApiResponse>(
        '/api/v1/drift/detect/feature',
        payload,
      );
      return data;
    },
  },

  metrics: {
    async performance(modelVersionId: number): Promise<PerformancePoint[]> {
      const client = createClient();
      const { data } = await client.get<PerformanceApiResponse[]>(
        `/api/v1/metrics/performance/${modelVersionId}`,
      );
      return data.map(normalizePerformance);
    },

    async summary(experimentId: number): Promise<PerformanceSummary> {
      const client = createClient();
      const { data } = await client.get<PerformanceSummary>(
        `/api/v1/metrics/performance/summary/${experimentId}`,
      );
      return data;
    },
  },

  retrain: {
    async trigger(experimentId: number, reason = 'manual'): Promise<RetrainResponse> {
      const client = createClient();
      const { data } = await client.post<RetrainResponse>('/api/v1/retrain/', {
        experiment_id: experimentId,
        reason,
        triggered_by: 'dashboard',
      });
      return data;
    },

    async history(experimentId: number): Promise<RetrainRecord[]> {
      const client = createClient();
      const { data } = await client.get<Record<string, unknown>[]>(
        `/api/v1/retrain/history/${experimentId}`,
      );
      return data.map((raw) => ({
        id: Number(raw.id),
        experimentId,
        type: (raw.type as RetrainRecord['type']) ?? 'retrain_completed',
        severity: (raw.severity as RetrainRecord['severity']) ?? 'info',
        message: String(raw.message ?? ''),
        reason: 'api',
        status: String(raw.type).includes('triggered')
          ? ('running' as const)
          : ('completed' as const),
        triggeredAt: String(raw.triggered_at ?? new Date().toISOString()),
      }));
    },
  },
};

export async function pingApi(): Promise<{
  ok: boolean;
  latencyMs: number;
  health?: HealthResponse;
  error?: string;
}> {
  const started = performance.now();
  try {
    const health = await api.health();
    return { ok: true, latencyMs: Math.round(performance.now() - started), health };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: apiErrorMessage(error),
    };
  }
}
