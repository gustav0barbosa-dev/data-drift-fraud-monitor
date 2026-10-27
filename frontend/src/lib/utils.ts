import {
  AlertSeverity,
  DriftLevel,
  ExperimentStatus,
  MethodKey,
  Severity,
} from '@/types';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDecimal(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(2);
  return formatNumber(value, digits);
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(value * 100, digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = Date.now() - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatShortDate(value);
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; badge: string; dot: string; text: string; bar: string }
> = {
  none: {
    label: 'Estável',
    badge: 'border-brand/25 bg-brand/10 text-brand',
    dot: 'bg-brand',
    text: 'text-brand',
    bar: 'bg-brand',
  },
  warning: {
    label: 'Atenção',
    badge: 'border-warn/25 bg-warn/10 text-warn',
    dot: 'bg-warn',
    text: 'text-warn',
    bar: 'bg-warn',
  },
  critical: {
    label: 'Crítico',
    badge: 'border-danger/25 bg-danger/10 text-danger',
    dot: 'bg-danger',
    text: 'text-danger',
    bar: 'bg-danger',
  },
};

export const ALERT_SEVERITY_META: Record<
  AlertSeverity,
  { label: string; badge: string; dot: string }
> = {
  info: {
    label: 'Informativo',
    badge: 'border-info/25 bg-info/10 text-info',
    dot: 'bg-info',
  },
  warning: {
    label: 'Atenção',
    badge: 'border-warn/25 bg-warn/10 text-warn',
    dot: 'bg-warn',
  },
  critical: {
    label: 'Crítico',
    badge: 'border-danger/25 bg-danger/10 text-danger',
    dot: 'bg-danger',
  },
};

export const DRIFT_LEVEL_META: Record<
  DriftLevel,
  { label: string; description: string; badge: string; intensity: number; shift: string }
> = {
  none: {
    label: 'Sem drift',
    description: 'Distribuições de referência e produção equivalentes (E1).',
    badge: 'border-brand/25 bg-brand/10 text-brand',
    intensity: 0,
    shift: '0,0σ · escala 1,00',
  },
  low: {
    label: 'Drift baixo',
    description: 'Deslocamento de 0,2σ e 5% de mudança de escala.',
    badge: 'border-info/25 bg-info/10 text-info',
    intensity: 0.3,
    shift: '0,2σ · escala 1,05',
  },
  moderate: {
    label: 'Drift moderado',
    description: 'Deslocamento de 0,5σ e 20% de mudança de escala.',
    badge: 'border-warn/25 bg-warn/10 text-warn',
    intensity: 0.65,
    shift: '0,5σ · escala 1,20',
  },
  high: {
    label: 'Drift forte',
    description: 'Deslocamento de 1,0σ e 50% de mudança de escala.',
    badge: 'border-danger/25 bg-danger/10 text-danger',
    intensity: 1,
    shift: '1,0σ · escala 1,50',
  },
};

export const STATUS_META: Record<
  ExperimentStatus,
  { label: string; badge: string; dot: string }
> = {
  pending: {
    label: 'Pendente',
    badge: 'border-line bg-elevated text-muted',
    dot: 'bg-muted',
  },
  running: {
    label: 'Em execução',
    badge: 'border-info/25 bg-info/10 text-info',
    dot: 'bg-info',
  },
  completed: {
    label: 'Concluído',
    badge: 'border-brand/25 bg-brand/10 text-brand',
    dot: 'bg-brand',
  },
  failed: {
    label: 'Falhou',
    badge: 'border-danger/25 bg-danger/10 text-danger',
    dot: 'bg-danger',
  },
};

export const METHOD_META: Record<
  MethodKey,
  {
    label: string;
    short: string;
    direction: 'above' | 'below';
    description: string;
    accent: string;
    color: string;
  }
> = {
  psi: {
    label: 'Population Stability Index',
    short: 'PSI',
    direction: 'above',
    description: 'Compara a distribuição por faixas de referência. Conservador e interpretável.',
    accent: 'text-brand',
    color: '#34d399',
  },
  ks: {
    label: 'Kolmogorov-Smirnov',
    short: 'KS',
    direction: 'below',
    description: 'Testa a igualdade das distribuições via ECDF. Sensível a deslocamentos pequenos.',
    accent: 'text-info',
    color: '#38bdf8',
  },
  js: {
    label: 'Jensen-Shannon',
    short: 'JS',
    direction: 'above',
    description: 'Distância simétrica entre distribuições, com correção de viés amostral.',
    accent: 'text-warn',
    color: '#fbbf24',
  },
  wasserstein: {
    label: 'Wasserstein',
    short: 'W₁',
    direction: 'above',
    description: 'Distância entre distribuições normalizada pelo desvio-padrão da referência.',
    accent: 'text-[#c084fc]',
    color: '#c084fc',
  },
};

export function featureLabel(name: string): string {
  const labels: Record<string, string> = {
    amount: 'Valor da transação',
    old_balance_org: 'Saldo anterior (origem)',
    new_balance_org: 'Saldo posterior (origem)',
    old_balance_dest: 'Saldo anterior (destino)',
    new_balance_dest: 'Saldo posterior (destino)',
    type: 'Tipo de transação',
    step: 'Passo temporal',
    balance_diff_org: 'Variação de saldo (origem)',
    balance_diff_dest: 'Variação de saldo (destino)',
    amount_ratio: 'Razão valor/saldo',
  };
  return labels[name] ?? name;
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
