'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CloudOff,
  Cpu,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sun,
  Wifi,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cx } from '@/lib/utils';
import { STATUS_META } from '@/lib/utils';
import { Badge, PersonaChip, ToastViewport } from '@/components/ui';

const NAV_GROUPS = [
  {
    label: 'Monitoramento',
    items: [
      {
        href: '/',
        label: 'Visão geral',
        icon: LayoutDashboard,
        person: 'P3' as const,
        description: 'KPIs, performance e alertas',
      },
      {
        href: '/drift',
        label: 'Drift & estatística',
        icon: Activity,
        person: 'P2' as const,
        description: 'PSI, KS, JS, Wasserstein',
      },
      {
        href: '/modelo',
        label: 'Modelo & dados',
        icon: Cpu,
        person: 'P1' as const,
        description: 'XGBoost, simulador, retreino',
      },
    ],
  },
  {
    label: 'Operação',
    items: [
      {
        href: '/experimentos',
        label: 'Experimentos',
        icon: FlaskConical,
        person: 'E1' as const,
        description: 'E1–E4 e ciclo de vida',
      },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      {
        href: '/sistema',
        label: 'Sistema & API',
        icon: Gauge,
        person: 'P3' as const,
        description: 'Serviços, endpoints e banco',
      },
      {
        href: '/configuracoes',
        label: 'Configurações',
        icon: SlidersHorizontal,
        person: 'P3' as const,
        description: 'Conexão, tema e padrões',
      },
    ],
  },
];

export const PAGE_META: Record<string, { title: string; eyebrow: string }> = {
  '/': { title: 'Visão geral', eyebrow: 'Monitoramento' },
  '/drift': { title: 'Drift & estatística', eyebrow: 'Monitoramento' },
  '/modelo': { title: 'Modelo & dados', eyebrow: 'Monitoramento' },
  '/experimentos': { title: 'Experimentos', eyebrow: 'Operação' },
  '/experiments': { title: 'Experimentos', eyebrow: 'Operação' },
  '/sistema': { title: 'Sistema & API', eyebrow: 'Plataforma' },
  '/configuracoes': { title: 'Configurações', eyebrow: 'Plataforma' },
  '/settings': { title: 'Configurações', eyebrow: 'Plataforma' },
};

function LogoMark() {
  return (
    <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-brand/25 bg-brand/10">
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden>
        <path
          d="M5 22l6-8 4.5 4L27 7"
          stroke="rgb(var(--brand))"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="5" cy="22" r="2" fill="rgb(var(--brand))" />
        <circle cx="27" cy="7" r="2" fill="rgb(var(--info))" />
        <path d="M5 27h22" stroke="rgb(var(--line))" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { online, latencyMs, experiments, settings } = useApp();
  const currentExperiment = experiments[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-5 pt-5">
        <LogoMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink">
            Data Drift Monitor
          </p>
          <p className="truncate text-2xs text-muted">Fraud analytics · experimental</p>
        </div>
      </div>

      <nav className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="label px-2.5 pb-1.5">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === '/'
                    ? router.pathname === '/'
                    : router.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cx(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                      active
                        ? 'bg-brand/10 text-ink'
                        : 'text-muted hover:bg-elevated/60 hover:text-ink',
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-brand" />
                    ) : null}
                    <Icon
                      className={cx(
                        'h-[17px] w-[17px] shrink-0',
                        active ? 'text-brand' : 'text-muted group-hover:text-ink',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-[10px] text-muted/80">
                        {item.description}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'mono rounded border px-1 py-0.5 text-[9px] font-semibold',
                        item.person === 'P1'
                          ? 'border-brand/25 text-brand'
                          : item.person === 'P2'
                            ? 'border-info/25 text-info'
                            : item.person === 'P3'
                              ? 'border-warn/25 text-warn'
                              : 'border-line text-muted',
                      )}
                    >
                      {item.person}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line/70 px-3 py-3">
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-2xs text-muted">
              {online === true ? (
                <Wifi className="h-3 w-3 text-brand" />
              ) : online === false ? (
                <CloudOff className="h-3 w-3 text-warn" />
              ) : (
                <RefreshCw className="h-3 w-3 animate-spin text-muted" />
              )}
              {online === true ? 'API conectada' : online === false ? 'Modo demo' : 'Conectando'}
            </span>
            {latencyMs !== null ? (
              <span className="mono text-2xs text-muted">{latencyMs}ms</span>
            ) : null}
          </div>
          {currentExperiment ? (
            <button
              type="button"
              onClick={() => router.push('/experimentos')}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-line/80 bg-surface/70 px-2 py-1.5 text-left transition hover:border-brand/30"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <FlaskConical className="h-3 w-3 shrink-0 text-brand" />
                <span className="truncate text-[10px] font-medium text-ink">
                  {experiments.length} experimentos
                </span>
              </span>
              <ChevronDown className="h-3 w-3 -rotate-90 text-muted" />
            </button>
          ) : null}
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
            <span>v1.0.0 · Next.js 14</span>
            <span className={cx('h-1.5 w-1.5 rounded-full', settings.forceDemo ? 'bg-warn' : online ? 'bg-brand' : 'bg-muted')} />
          </div>
        </div>
        <p className="mt-2 px-1 text-center text-[10px] text-muted/70">
          P1 ML · P2 Drift · P3 Software
        </p>
      </div>
    </div>
  );
}

function ExperimentSelector({ className }: { className?: string }) {
  const {
    experiments,
    selectedExperiment,
    selectExperiment,
    experimentsSource,
  } = useApp();

  return (
    <div className={cx('group relative', className)}>
      <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand">
        <FlaskConical className="h-3.5 w-3.5" />
      </div>
      <select
        aria-label="Selecionar experimento"
        title={
          experimentsSource === 'demo'
            ? 'Experimentos da base de demonstração'
            : 'Experimentos carregados da API'
        }
        value={selectedExperiment?.id ?? ''}
        onChange={(event) => selectExperiment(Number(event.target.value))}
        className="field h-9 w-full cursor-pointer border-line bg-elevated/70 pl-8 pr-8 text-xs font-medium"
      >
        {experiments.map((experiment) => (
          <option key={experiment.id} value={experiment.id}>
            {experiment.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2">
        {selectedExperiment ? (
          <span
            className={cx(
              'inline-block h-1.5 w-1.5 rounded-full',
              STATUS_META[selectedExperiment.status].dot,
            )}
          />
        ) : null}
      </span>
    </div>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { online, latencyMs, refreshAll, settings, updateSettings, resolvedTheme } =
    useApp();
  const meta = PAGE_META[router.pathname] ?? { title: 'Monitoramento', eyebrow: 'Plataforma' };
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refreshAll();
    window.setTimeout(() => setSpinning(false), 900);
  };

  const toggleTheme = () => {
    updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-base/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
        <button
          type="button"
          className="btn btn-icon btn-sm border border-line bg-surface text-muted lg:hidden"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
          <span className="text-muted">{meta.eyebrow}</span>
          <span className="text-muted/40">/</span>
          <span className="font-medium text-ink">{meta.title}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-[290px] md:block">
            <ExperimentSelector className="w-full" />
          </div>

          <span
            className={cx(
              'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium sm:flex',
              online === true
                ? 'border-brand/25 bg-brand/10 text-brand'
                : online === false
                  ? 'border-warn/25 bg-warn/10 text-warn'
                  : 'border-line bg-elevated text-muted',
            )}
            title={
              online === true
                ? `API conectada${latencyMs !== null ? ` · ${latencyMs} ms` : ''}`
                : settings.forceDemo
                  ? 'Modo demonstração ativado'
                  : 'API offline — dados simulados'
            }
          >
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                online === true
                  ? 'bg-brand animate-pulse-ring'
                  : online === false
                    ? 'bg-warn'
                    : 'bg-muted',
              )}
            />
            {online === true ? 'Online' : online === false ? 'Demo' : '…'}
          </span>

          <button
            type="button"
            onClick={handleRefresh}
            className="btn btn-icon btn-sm border border-line bg-surface text-muted transition hover:border-brand/35 hover:text-ink"
            aria-label="Sincronizar dados"
            title="Sincronizar dados"
          >
            <RefreshCw className={cx('h-3.5 w-3.5', spinning && 'animate-spin')} />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-icon btn-sm border border-line bg-surface text-muted transition hover:border-brand/35 hover:text-ink"
            aria-label="Alternar tema"
            title="Alternar tema"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/configuracoes')}
            className="btn btn-icon btn-sm border border-line bg-surface text-muted transition hover:border-brand/35 hover:text-ink"
            aria-label="Configurações"
            title="Configurações"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line/40 px-4 py-1.5 text-[10px] text-muted lg:hidden">
        <ExperimentSelector className="w-full" />
        <span className="flex shrink-0 items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-warn" />
          ambiente experimental
        </span>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { toasts, dismissToast, experimentsError, online, settings } = useApp();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-line/80 bg-surface/60 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[280px] animate-slide-in border-r border-line bg-surface">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-ink"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[252px]">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8 lg:py-7">
          {online === false && !settings.forceDemo && experimentsError ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-2xs text-warn">
              <CloudOff className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{experimentsError}</span>
              <Link
                href="/configuracoes"
                className="shrink-0 font-semibold underline decoration-warn/40 underline-offset-2"
              >
                Conectar API
              </Link>
            </div>
          ) : null}
          {children}
          <footer className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-line/60 pt-4 text-[10px] text-muted sm:flex-row sm:items-center">
            <span>
              Plataforma experimental de monitoramento de Data Drift · XGBoost + PaySim · E1–E4
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">D5 · Dashboard</Badge>
              <Badge tone="info">D4 · API</Badge>
              <Badge tone="warn">D8 · Docs</Badge>
              <PersonaChip person="Pessoa 3" compact />
            </div>
          </footer>
        </main>
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
