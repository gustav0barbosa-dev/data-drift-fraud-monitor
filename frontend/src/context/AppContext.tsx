'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppSettings,
  DataSource,
  DriftThresholds,
  Experiment,
  ExperimentCreatePayload,
  ExperimentStatus,
  HealthResponse,
  RetrainRecord,
  ToastMessage,
} from '@/types';
import { api, apiErrorMessage, configureApi, pingApi } from '@/services/api';
import {
  DEMO_EXPERIMENTS,
  buildPerformanceTimeline,
} from '@/data/mock';
import { DEFAULT_THRESHOLDS, cloneThresholds } from '@/data/thresholds';

const SETTINGS_KEY = 'dd_settings_v1';
const SELECTED_EXPERIMENT_KEY = 'dd_selected_experiment';
const THRESHOLDS_KEY = 'dd_thresholds_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  apiUrl:
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000',
  theme: 'dark',
  pollInterval: 30,
  forceDemo: false,
  compact: false,
  timeout: 5000,
};

interface AppContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
  resolvedTheme: 'dark' | 'light';

  online: boolean | null;
  health: HealthResponse | null;
  latencyMs: number | null;
  healthError: string | null;
  checkHealth: () => Promise<void>;

  experiments: Experiment[];
  experimentsSource: DataSource;
  experimentsLoading: boolean;
  experimentsError: string | null;
  selectedExperiment: Experiment | undefined;
  selectedExperimentId: number | null;
  selectExperiment: (id: number) => void;
  refreshAll: () => void;
  refreshKey: number;
  createExperiment: (payload: ExperimentCreatePayload) => Promise<Experiment>;
  updateExperiment: (id: number, patch: Record<string, unknown>) => Promise<void>;
  deleteExperiment: (id: number) => Promise<void>;
  setExperimentStatus: (id: number, status: ExperimentStatus) => Promise<void>;

  thresholds: DriftThresholds;
  updateThresholds: (next: DriftThresholds) => void;
  resetThresholds: () => void;
  thresholdsCustomized: boolean;

  resolvedOverrides: Record<number, boolean>;
  resolveAlert: (alertId: number, resolved: boolean) => Promise<void>;

  retrains: Record<number, RetrainRecord[]>;
  triggerRetrain: (
    experimentId: number,
    reason: string,
  ) => Promise<{ ok: boolean; message: string }>;

  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function readSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readThresholds(): { thresholds: DriftThresholds; customized: boolean } {
  if (typeof window === 'undefined') {
    return { thresholds: cloneThresholds(DEFAULT_THRESHOLDS), customized: false };
  }
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) {
      return { thresholds: cloneThresholds(DEFAULT_THRESHOLDS), customized: false };
    }
    return {
      thresholds: { ...cloneThresholds(DEFAULT_THRESHOLDS), ...JSON.parse(raw) },
      customized: true,
    };
  } catch {
    return { thresholds: cloneThresholds(DEFAULT_THRESHOLDS), customized: false };
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

  const [online, setOnline] = useState<boolean | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [experiments, setExperiments] = useState<Experiment[]>(DEMO_EXPERIMENTS);
  const [experimentsSource, setExperimentsSource] = useState<DataSource>('demo');
  const [experimentsLoading, setExperimentsLoading] = useState(false);
  const [experimentsError, setExperimentsError] = useState<string | null>(null);

  const [selectedExperimentId, setSelectedExperimentId] = useState<number | null>(2);
  const [refreshKey, setRefreshKey] = useState(0);

  const [{ thresholds, customized: thresholdsCustomized }, setThresholdsState] =
    useState(() => readThresholds());

  const [resolvedOverrides, setResolvedOverrides] = useState<Record<number, boolean>>({});
  const [retrains, setRetrains] = useState<Record<number, RetrainRecord[]>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(1);

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = toastId.current++;
    setToasts((current) => [...current, { ...toast, id }]);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, 5200);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  // ----------------------------------------------------------
  // Preferências persistidas
  // ----------------------------------------------------------
  useEffect(() => {
    const stored = readSettings();
    setSettings(stored);
    const storedSelected = window.localStorage.getItem(SELECTED_EXPERIMENT_KEY);
    if (storedSelected) {
      const parsed = Number(storedSelected);
      if (Number.isFinite(parsed)) setSelectedExperimentId(parsed);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    configureApi({ baseUrl: settings.apiUrl, timeout: settings.timeout });
  }, [settings, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const apply = () => {
      const systemDark =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme: 'dark' | 'light' =
        settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
      setResolvedTheme(theme);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.dataset.density = settings.compact ? 'compact' : 'comfortable';
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme, settings.compact, mounted]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setThresholdsState({
      thresholds: cloneThresholds(DEFAULT_THRESHOLDS),
      customized: false,
    });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SETTINGS_KEY);
      window.localStorage.removeItem(THRESHOLDS_KEY);
    }
    pushToast({
      tone: 'info',
      title: 'Configurações restauradas',
      description: 'Preferências, API e limiares voltaram ao padrão.',
    });
  }, [pushToast]);

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------
  const checkHealth = useCallback(async () => {
    if (settings.forceDemo) {
      setOnline(false);
      setHealth(null);
      setLatencyMs(null);
      setHealthError('Modo demonstração ativado nas configurações.');
      return;
    }
    const result = await pingApi();
    setOnline(result.ok);
    setHealth(result.health ?? null);
    setLatencyMs(result.latencyMs);
    setHealthError(result.ok ? null : result.error ?? null);
  }, [settings.forceDemo, settings.apiUrl, settings.timeout]);

  useEffect(() => {
    if (!mounted) return;
    configureApi({ baseUrl: settings.apiUrl, timeout: settings.timeout });
    checkHealth();
  }, [mounted, settings.apiUrl, settings.timeout, settings.forceDemo, checkHealth]);

  useEffect(() => {
    if (!mounted || settings.forceDemo) return;
    const interval = window.setInterval(checkHealth, 45000);
    return () => window.clearInterval(interval);
  }, [mounted, checkHealth, settings.forceDemo]);

  // ----------------------------------------------------------
  // Experimentos
  // ----------------------------------------------------------
  const loadExperiments = useCallback(async () => {
    if (online !== true) {
      setExperiments(DEMO_EXPERIMENTS);
      setExperimentsSource('demo');
      setExperimentsError(
        settings.forceDemo ? null : 'API indisponível — usando experimentos de demonstração.',
      );
      return;
    }
    setExperimentsLoading(true);
    try {
      const response = await api.experiments.list({ limit: 100 });
      if (response.items.length > 0) {
        setExperiments(response.items);
        setExperimentsSource('live');
        setExperimentsError(null);
      } else {
        setExperiments(DEMO_EXPERIMENTS);
        setExperimentsSource('demo');
        setExperimentsError(
          'A API está online, mas não há experimentos cadastrados. Exibindo base de demonstração.',
        );
      }
    } catch (error) {
      setExperiments(DEMO_EXPERIMENTS);
      setExperimentsSource('demo');
      setExperimentsError(apiErrorMessage(error));
    } finally {
      setExperimentsLoading(false);
    }
  }, [online, settings.forceDemo]);

  useEffect(() => {
    if (!mounted) return;
    loadExperiments();
  }, [mounted, loadExperiments, refreshKey]);

  useEffect(() => {
    if (experiments.length === 0) return;
    const exists = experiments.some(
      (experiment) => experiment.id === selectedExperimentId,
    );
    if (!exists) {
      setSelectedExperimentId(experiments[0].id);
    }
  }, [experiments, selectedExperimentId]);

  useEffect(() => {
    if (!mounted || selectedExperimentId === null) return;
    window.localStorage.setItem(
      SELECTED_EXPERIMENT_KEY,
      String(selectedExperimentId),
    );
  }, [selectedExperimentId, mounted]);

  const selectExperiment = useCallback(
    (id: number) => {
      setSelectedExperimentId(id);
      setRefreshKey((value) => value + 1);
    },
    [],
  );

  const refreshAll = useCallback(() => {
    setRefreshKey((value) => value + 1);
    checkHealth();
    pushToast({ tone: 'info', title: 'Dados sincronizados' });
  }, [checkHealth, pushToast]);

  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.id === selectedExperimentId),
    [experiments, selectedExperimentId],
  );

  // ----------------------------------------------------------
  // CRUD de experimentos (API com fallback local)
  // ----------------------------------------------------------
  const createExperiment = useCallback(
    async (payload: ExperimentCreatePayload): Promise<Experiment> => {
      if (online === true) {
        try {
          const created = await api.experiments.create(payload);
          setExperiments((current) => [created, ...current]);
          setExperimentsSource('live');
          setSelectedExperimentId(created.id);
          pushToast({
            tone: 'success',
            title: 'Experimento criado',
            description: payload.name,
          });
          return created;
        } catch (error) {
          pushToast({
            tone: 'error',
            title: 'Falha ao criar experimento',
            description: apiErrorMessage(error),
          });
          throw error;
        }
      }

      const now = new Date().toISOString();
      const local: Experiment = {
        id: Math.max(0, ...experiments.map((experiment) => experiment.id)) + 1,
        name: payload.name,
        description: payload.description ?? null,
        drift_level: payload.drift_level,
        status: 'pending',
        config: payload.config ?? { scenario: 'custom' },
        started_at: null,
        finished_at: null,
        created_at: now,
        updated_at: now,
      };
      setExperiments((current) => [local, ...current]);
      setSelectedExperimentId(local.id);
      pushToast({
        tone: 'success',
        title: 'Experimento criado (local)',
        description: 'API offline — alteração mantida apenas neste navegador.',
      });
      return local;
    },
    [online, experiments, pushToast],
  );

  const updateExperiment = useCallback(
    async (id: number, patch: Record<string, unknown>) => {
      if (online === true) {
        try {
          const updated = await api.experiments.update(id, patch);
          setExperiments((current) =>
            current.map((experiment) => (experiment.id === id ? updated : experiment)),
          );
          pushToast({ tone: 'success', title: 'Experimento atualizado' });
          return;
        } catch (error) {
          pushToast({
            tone: 'error',
            title: 'Falha ao atualizar',
            description: apiErrorMessage(error),
          });
          throw error;
        }
      }
      setExperiments((current) =>
        current.map((experiment) =>
          experiment.id === id
            ? { ...experiment, ...patch, updated_at: new Date().toISOString() }
            : experiment,
        ),
      );
      pushToast({
        tone: 'success',
        title: 'Experimento atualizado (local)',
      });
    },
    [online, pushToast],
  );

  const setExperimentStatus = useCallback(
    async (id: number, status: ExperimentStatus) => {
      if (online === true) {
        try {
          const updated = await api.experiments.setStatus(id, status);
          setExperiments((current) =>
            current.map((experiment) => (experiment.id === id ? updated : experiment)),
          );
          pushToast({
            tone: 'success',
            title: 'Status atualizado',
            description: `Experimento marcado como ${status}.`,
          });
          return;
        } catch (error) {
          pushToast({
            tone: 'error',
            title: 'Falha ao alterar status',
            description: apiErrorMessage(error),
          });
          throw error;
        }
      }
      const now = new Date().toISOString();
      setExperiments((current) =>
        current.map((experiment) =>
          experiment.id === id
            ? {
                ...experiment,
                status,
                started_at:
                  status === 'running' && !experiment.started_at
                    ? now
                    : experiment.started_at,
                finished_at: status === 'completed' ? now : experiment.finished_at,
                updated_at: now,
              }
            : experiment,
        ),
      );
      pushToast({ tone: 'success', title: 'Status atualizado (local)' });
    },
    [online, pushToast],
  );

  const deleteExperiment = useCallback(
    async (id: number) => {
      if (online === true) {
        try {
          await api.experiments.remove(id);
        } catch (error) {
          pushToast({
            tone: 'error',
            title: 'Falha ao remover experimento',
            description: apiErrorMessage(error),
          });
          throw error;
        }
      }
      setExperiments((current) => current.filter((experiment) => experiment.id !== id));
      pushToast({ tone: 'success', title: 'Experimento removido' });
    },
    [online, pushToast],
  );

  // ----------------------------------------------------------
  // Limiares
  // ----------------------------------------------------------
  const updateThresholds = useCallback(
    (next: DriftThresholds) => {
      setThresholdsState({ thresholds: next, customized: true });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(next));
      }
      pushToast({
        tone: 'success',
        title: 'Limiares atualizados',
        description: 'A classificação de severidade já usa a nova configuração.',
      });
    },
    [pushToast],
  );

  const resetThresholds = useCallback(() => {
    setThresholdsState({
      thresholds: cloneThresholds(DEFAULT_THRESHOLDS),
      customized: false,
    });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(THRESHOLDS_KEY);
    }
    pushToast({ tone: 'info', title: 'Limiares padrão restaurados' });
  }, [pushToast]);

  // ----------------------------------------------------------
  // Alertas e retreinamento
  // ----------------------------------------------------------
  const resolveAlert = useCallback(
    async (alertId: number, resolved: boolean) => {
      setResolvedOverrides((current) => ({ ...current, [alertId]: resolved }));
      if (online === true) {
        try {
          await api.drift.resolveAlert(alertId, resolved);
        } catch {
          // O estado local já foi atualizado; alertas de demonstração não existem na API.
        }
      }
      pushToast({
        tone: resolved ? 'success' : 'info',
        title: resolved ? 'Alerta resolvido' : 'Alerta reaberto',
      });
    },
    [online, pushToast],
  );

  const triggerRetrain = useCallback(
    async (experimentId: number, reason: string) => {
      const experiment = experiments.find((item) => item.id === experimentId);
      const timeline = experiment ? buildPerformanceTimeline(experiment) : [];
      const currentF1 = timeline[timeline.length - 1]?.f1 ?? 0.8;
      const record: RetrainRecord = {
        id: Date.now(),
        experimentId,
        type: 'retrain_triggered',
        severity: 'info',
        message: `Retreinamento solicitado pelo dashboard (${reason}).`,
        reason,
        status: 'running',
        triggeredAt: new Date().toISOString(),
      };

      setRetrains((current) => ({
        ...current,
        [experimentId]: [record, ...(current[experimentId] ?? [])],
      }));

      let apiAccepted = false;
      if (online === true) {
        try {
          await api.retrain.trigger(experimentId, reason);
          apiAccepted = true;
        } catch (error) {
          pushToast({
            tone: 'warning',
            title: 'API não aceitou o retreino',
            description: `${apiErrorMessage(error)} Simulação local registrada.`,
          });
        }
      }

      pushToast({
        tone: 'success',
        title: 'Retreinamento iniciado',
        description: apiAccepted
          ? 'A API está executando o job em background.'
          : 'Execução simulada no dashboard (modo demonstração).',
      });

      window.setTimeout(() => {
        const improvedF1 = Math.min(0.938, currentF1 + 0.12);
        setRetrains((current) => {
          const list = current[experimentId] ?? [];
          return {
            ...current,
            [experimentId]: list.map((item) =>
              item.id === record.id
                ? {
                    ...item,
                    type: 'retrain_completed',
                    severity: 'info',
                    status: 'completed',
                    message: 'Retreinamento concluído e nova versão promovida.',
                    version: 'v1.4.0-xgb',
                    f1Before: Number(currentF1.toFixed(4)),
                    f1After: Number(improvedF1.toFixed(4)),
                  }
                : item,
            ),
          };
        });
        pushToast({
          tone: 'success',
          title: 'Retreinamento concluído',
          description: 'Nova versão ativa com recuperação parcial de F1.',
        });
      }, 2200);

      return {
        ok: true,
        message: apiAccepted ? 'Job enviado para a API.' : 'Simulação local concluída.',
      };
    },
    [online, experiments, pushToast],
  );

  // ----------------------------------------------------------
  // Valor do contexto
  // ----------------------------------------------------------
  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      resetSettings,
      resolvedTheme,
      online,
      health,
      latencyMs,
      healthError,
      checkHealth,
      experiments,
      experimentsSource,
      experimentsLoading,
      experimentsError,
      selectedExperiment,
      selectedExperimentId,
      selectExperiment,
      refreshAll,
      refreshKey,
      createExperiment,
      updateExperiment,
      deleteExperiment,
      setExperimentStatus,
      thresholds,
      updateThresholds,
      resetThresholds,
      thresholdsCustomized,
      resolvedOverrides,
      resolveAlert,
      retrains,
      triggerRetrain,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      settings,
      updateSettings,
      resetSettings,
      resolvedTheme,
      online,
      health,
      latencyMs,
      healthError,
      checkHealth,
      experiments,
      experimentsSource,
      experimentsLoading,
      experimentsError,
      selectedExperiment,
      selectedExperimentId,
      selectExperiment,
      refreshAll,
      refreshKey,
      createExperiment,
      updateExperiment,
      deleteExperiment,
      setExperimentStatus,
      thresholds,
      updateThresholds,
      resetThresholds,
      thresholdsCustomized,
      resolvedOverrides,
      resolveAlert,
      retrains,
      triggerRetrain,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp deve ser usado dentro de AppProvider');
  }
  return context;
}
