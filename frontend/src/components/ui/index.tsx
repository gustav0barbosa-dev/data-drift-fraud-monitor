'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@/lib/utils';

// ============================================================
// Botões
// ============================================================
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-[rgb(var(--brand-contrast))] hover:bg-brand/90 shadow-[0_8px_24px_-14px_rgb(var(--brand))]',
  secondary:
    'bg-elevated text-ink border border-line hover:border-brand/40 hover:bg-elevated/80',
  outline:
    'bg-transparent text-ink border border-line hover:border-brand/45 hover:text-brand',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-elevated/70',
  danger:
    'bg-danger/12 text-danger border border-danger/30 hover:bg-danger/20',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden />
      ) : null}
      {children}
      {IconRight ? <IconRight className="h-4 w-4" aria-hidden /> : null}
    </button>
  );
}

// ============================================================
// Card / badges
// ============================================================
export function Card({
  className,
  children,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx('card', interactive && 'card-interactive', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-elevated/70 text-brand">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="label mb-1">{eyebrow}</p> : null}
          <h3 className="truncate text-sm font-semibold tracking-tight text-ink">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'warn' | 'danger' | 'info' | 'purple';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-elevated/80 text-muted',
  brand: 'border-brand/25 bg-brand/10 text-brand',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  purple: 'border-[#c084fc]/25 bg-[#c084fc]/10 text-[#c084fc]',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
  icon: Icon,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <span className={cx('badge', BADGE_TONES[tone], className)}>
      {dot ? <span className={cx('h-1.5 w-1.5 rounded-full', dotColor(tone))} /> : null}
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

function dotColor(tone: BadgeTone): string {
  return {
    neutral: 'bg-muted',
    brand: 'bg-brand',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-info',
    purple: 'bg-[#c084fc]',
  }[tone];
}

export function SeverityBadge({
  severity,
  label,
}: {
  severity: 'none' | 'warning' | 'critical';
  label?: string;
}) {
  const map = {
    none: { tone: 'brand' as const, text: 'Estável' },
    warning: { tone: 'warn' as const, text: 'Atenção' },
    critical: { tone: 'danger' as const, text: 'Crítico' },
  }[severity];
  return (
    <Badge tone={map.tone} dot>
      {label ?? map.text}
    </Badge>
  );
}

// ============================================================
// Inputs
// ============================================================
export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  suffix?: string;
}

export function Input({ label, hint, error, suffix, className, id, ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <label className="block" htmlFor={inputId}>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      ) : null}
      <span className="relative block">
        <input
          id={inputId}
          className={cx('field', suffix && 'pr-12', error && 'border-danger/60', className)}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-medium text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
      {error ? (
        <span className="mt-1 block text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-2xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Select({
  label,
  hint,
  error,
  className,
  children,
  id,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  const selectId = id ?? props.name ?? label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <label className="block" htmlFor={selectId}>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      ) : null}
      <select
        id={selectId}
        className={cx('field', error && 'border-danger/60', className)}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <span className="mt-1 block text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-2xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  const textareaId = id ?? props.name ?? label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <label className="block" htmlFor={textareaId}>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      ) : null}
      <textarea
        id={textareaId}
        className={cx('field', error && 'border-danger/60', className)}
        {...props}
      />
      {error ? (
        <span className="mt-1 block text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-2xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {description ? (
          <p className="mt-0.5 text-2xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked
            ? 'border-brand/40 bg-brand/80'
            : 'border-line bg-elevated',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[21px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

// ============================================================
// Tabs
// ============================================================
export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cx(
        'scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface/70 p-1 backdrop-blur',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1.5 text-2xs' : 'px-3.5 py-2 text-xs',
              active
                ? 'bg-elevated text-ink shadow-sm ring-1 ring-line'
                : 'text-muted hover:bg-elevated/60 hover:text-ink',
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cx(
                  'rounded-full px-1.5 py-0.5 text-2xs mono',
                  active ? 'bg-brand/15 text-brand' : 'bg-elevated text-muted',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Layout helpers
// ============================================================
export function PageHeader({
  title,
  description,
  eyebrow,
  persona,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  persona?: 'Pessoa 1' | 'Pessoa 2' | 'Pessoa 3';
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {eyebrow ? <span className="label">{eyebrow}</span> : null}
          {persona ? <PersonaChip person={persona} /> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink lg:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PersonaChip({
  person,
  compact = false,
}: {
  person: 'Pessoa 1' | 'Pessoa 2' | 'Pessoa 3';
  compact?: boolean;
}) {
  const map = {
    'Pessoa 1': { role: 'ML & Dados', tone: 'brand' as const },
    'Pessoa 2': { role: 'Drift & Estatística', tone: 'info' as const },
    'Pessoa 3': { role: 'Software & Fullstack', tone: 'warn' as const },
  }[person];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium',
        BADGE_TONES[map.tone],
      )}
      title={`${person} · ${map.role}`}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', dotColor(map.tone))} />
      {person}
      {!compact ? <span className="opacity-70">· {map.role}</span> : null}
    </span>
  );
}

export function SectionTitle({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-2xs text-muted">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function SourceBadge({
  source,
  className,
}: {
  source: 'live' | 'demo' | 'mixed';
  className?: string;
}) {
  if (source === 'live') {
    return (
      <Badge tone="brand" dot className={className}>
        API ao vivo
      </Badge>
    );
  }
  if (source === 'mixed') {
    return (
      <Badge tone="info" dot className={className}>
        Dados híbridos
      </Badge>
    );
  }
  return (
    <Badge tone="warn" dot className={className}>
      Demonstração
    </Badge>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  icon: Icon,
  tone = 'brand',
  spark,
  invertDelta = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: number;
  deltaLabel?: string;
  icon: LucideIcon;
  tone?: BadgeTone;
  spark?: number[];
  invertDelta?: boolean;
}) {
  const positive = delta !== undefined && delta !== 0
    ? invertDelta
      ? delta < 0
      : delta > 0
    : null;
  const iconTone = BADGE_TONES[tone];
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">{label}</p>
          <p className="mono mt-2 text-[1.65rem] font-semibold leading-none tracking-tight text-ink">
            {value}
          </p>
        </div>
        <span
          className={cx(
            'grid h-9 w-9 place-items-center rounded-lg border',
            iconTone,
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-2xs">
          {delta !== undefined && Number.isFinite(delta) ? (
            <span
              className={cx(
                'mono font-semibold',
                positive === null
                  ? 'text-muted'
                  : positive
                    ? 'text-brand'
                    : 'text-danger',
              )}
            >
              {delta > 0 ? '+' : ''}
              {(delta * 100).toFixed(1)} p.p.
            </span>
          ) : null}
          <span className="truncate text-muted">{deltaLabel ?? hint}</span>
        </div>
        {spark && spark.length > 1 ? <MiniSpark values={spark} tone={tone} /> : null}
      </div>
    </Card>
  );
}

function MiniSpark({ values, tone }: { values: number[]; tone: BadgeTone }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 62;
  const height = 20;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  const stroke = {
    brand: '#34d399',
    danger: '#fb7185',
    warn: '#fbbf24',
    info: '#38bdf8',
    purple: '#c084fc',
    neutral: '#8c9ab0',
  }[tone];
  return (
    <svg width={width} height={height} className="shrink-0 opacity-90" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Meter({
  value,
  max = 1,
  tone = 'brand',
  thresholds = [],
  className,
  height = 'h-1.5',
}: {
  value: number;
  max?: number;
  tone?: BadgeTone;
  thresholds?: { value: number; tone: BadgeTone; label?: string }[];
  className?: string;
  height?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = {
    brand: 'bg-brand',
    danger: 'bg-danger',
    warn: 'bg-warn',
    info: 'bg-info',
    purple: 'bg-[#c084fc]',
    neutral: 'bg-muted',
  }[tone];
  return (
    <div className={cx('relative w-full overflow-hidden rounded-full bg-elevated', height, className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', fill)} style={{ width: `${pct}%` }} />
      {thresholds.map((threshold) => (
        <span
          key={`${threshold.value}-${threshold.tone}`}
          className={cx(
            'absolute top-0 h-full w-px opacity-80',
            threshold.tone === 'danger' ? 'bg-danger' : 'bg-warn',
          )}
          style={{ left: `${Math.min(100, (threshold.value / max) * 100)}%` }}
          title={threshold.label}
        />
      ))}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 54,
  stroke = 5,
  tone = 'brand',
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: BadgeTone;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  const color = {
    brand: 'stroke-brand',
    danger: 'stroke-danger',
    warn: 'stroke-warn',
    info: 'stroke-info',
    purple: 'stroke-[#c084fc]',
    neutral: 'stroke-muted',
  }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-elevated"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span className="mono absolute text-2xs font-semibold text-ink">
        {label ?? `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

// ============================================================
// Modal / Drawer
// ============================================================
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative z-10 w-full animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar modal">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated/30 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-xl animate-slide-in flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar detalhe">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated/30 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

// ============================================================
// Estados / utilidades
// ============================================================
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('animate-pulse rounded-lg bg-elevated/80', className)}
      aria-hidden
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon = AlertCircle,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-line bg-elevated/70 text-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center justify-between gap-4 py-1.5', className)}>
      <span className="text-xs text-muted">{label}</span>
      <span className={cx('text-right text-xs font-medium text-ink', mono && 'mono')}>
        {value}
      </span>
    </div>
  );
}

export function CopyButton({
  value,
  label = 'Copiar',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onCopy}
      className={className}
      icon={copied ? Check : Copy}
    >
      {copied ? 'Copiado' : label}
    </Button>
  );
}

export function JsonView({ data, className }: { data: unknown; className?: string }) {
  return (
    <pre
      className={cx(
        'mono max-h-80 overflow-auto rounded-xl border border-line bg-[rgb(var(--bg))] p-3 text-2xs leading-relaxed text-muted',
        className,
      )}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function LinkArrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-brand">
      {children}
      <ChevronRight className="h-3 w-3" />
    </span>
  );
}

// ============================================================
// Toaster
// ============================================================
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: {
    id: number;
    title: string;
    description?: string;
    tone: 'success' | 'error' | 'info' | 'warning';
  }[];
  onDismiss: (id: number) => void;
}) {
  const meta = {
    success: { icon: CheckCircle2, className: 'border-brand/30 text-brand' },
    error: { icon: XCircle, className: 'border-danger/30 text-danger' },
    info: { icon: Info, className: 'border-info/30 text-info' },
    warning: { icon: AlertTriangle, className: 'border-warn/30 text-warn' },
  };
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const config = meta[toast.tone];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto animate-slide-in rounded-xl border border-line bg-surface/95 p-3.5 shadow-[var(--shadow-pop)] backdrop-blur"
            role="status"
          >
            <div className="flex items-start gap-2.5">
              <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', config.className)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Fechar notificação"
                className="text-muted transition hover:text-ink"
                onClick={() => onDismiss(toast.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
