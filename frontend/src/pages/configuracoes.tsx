'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  Gauge,
  HeartPulse,
  Moon,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { AppSettings, ThemeMode } from '@/types';
import { useApp } from '@/context/AppContext';
import { DEFAULT_SETTINGS } from '@/context/AppContext';
import { configureApi, pingApi } from '@/services/api';
import {
  cx,
  downloadJson,
  formatDecimal,
} from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoRow,
  Input,
  Modal,
  PageHeader,
  SourceBadge,
  Toggle,
} from '@/components/ui';

const THEMES: { value: ThemeMode; label: string; icon: typeof Moon; description: string }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon, description: 'Padrão fintech, menor fadiga visual.' },
  { value: 'light', label: 'Claro', icon: Sun, description: 'Melhor leitura em ambientes iluminados.' },
  { value: 'system', label: 'Sistema', icon: Monitor, description: 'Segue a preferência do SO.' },
];

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    resetSettings,
    resolvedTheme,
    online,
    latencyMs,
    healthError,
    checkHealth,
    refreshAll,
    thresholds,
    thresholdsCustomized,
    resetThresholds,
    experiments,
    experimentsSource,
    pushToast,
  } = useApp();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    error?: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!/^https?:\/\/.+/i.test(draft.apiUrl.trim())) {
      errors.push('A URL da API deve começar com http:// ou https://.');
    }
    if (draft.timeout < 500 || draft.timeout > 30000) {
      errors.push('O timeout deve estar entre 500 ms e 30.000 ms.');
    }
    if (draft.pollInterval < 0 || draft.pollInterval > 300) {
      errors.push('O intervalo de polling deve estar entre 0 e 300 segundos.');
    }
    return errors;
  }, [draft]);

  const dirty = useMemo(
    () =>
      draft.apiUrl !== settings.apiUrl ||
      draft.timeout !== settings.timeout ||
      draft.pollInterval !== settings.pollInterval ||
      draft.forceDemo !== settings.forceDemo,
    [draft, settings],
  );

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    configureApi({ baseUrl: draft.apiUrl, timeout: draft.timeout });
    const result = await pingApi();
    setTestResult({
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error,
    });
    configureApi({ baseUrl: settings.apiUrl, timeout: settings.timeout });
    setTesting(false);
  };

  const saveConnection = () => {
    if (validation.length > 0) return;
    updateSettings({
      apiUrl: draft.apiUrl.trim().replace(/\/$/, ''),
      timeout: draft.timeout,
      pollInterval: draft.pollInterval,
      forceDemo: draft.forceDemo,
    });
    pushToast({
      tone: 'success',
      title: 'Conexão atualizada',
      description: draft.forceDemo
        ? 'Modo demonstração ativado.'
        : 'O dashboard tentará sincronizar com a nova URL.',
    });
  };

  const exportSnapshot = () => {
    downloadJson(`dashboard-snapshot-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      settings,
      thresholds,
      experiments,
      health: { online, latencyMs, error: healthError },
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 3 · Plataforma"
        persona="Pessoa 3"
        title="Configurações"
        description="Conexão com a API, aparência, limiares de drift e manutenção dos dados locais do dashboard."
        actions={
          <>
            <Button variant="outline" icon={RefreshCw} onClick={refreshAll}>
              Sincronizar
            </Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              onClick={() => setResetOpen(true)}
            >
              Restaurar padrão
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              icon={Server}
              title="Conexão com a API"
              description="URL base do FastAPI, timeout e frequência de atualização automática."
              actions={
                <Badge tone={online === true ? 'brand' : online === false ? 'warn' : 'neutral'} dot>
                  {online === true ? 'online' : online === false ? 'offline' : 'verificando'}
                </Badge>
              }
            />

            <div className="mt-3 space-y-3">
              <Input
                label="URL base"
                value={draft.apiUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, apiUrl: event.target.value }))
                }
                placeholder="http://localhost:8000"
                className="mono text-xs"
                hint="Sem barra final. Ex.: http://localhost:8000 ou http://api:8000."
                error={validation.find((error) => error.includes('URL'))}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Timeout"
                  type="number"
                  min={500}
                  max={30000}
                  step={500}
                  value={draft.timeout}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      timeout: Number(event.target.value),
                    }))
                  }
                  suffix="ms"
                  className="mono text-xs"
                  error={validation.find((error) => error.includes('timeout'))}
                />
                <Input
                  label="Polling"
                  type="number"
                  min={0}
                  max={300}
                  step={5}
                  value={draft.pollInterval}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      pollInterval: Number(event.target.value),
                    }))
                  }
                  suffix="s"
                  className="mono text-xs"
                  hint="0 desativa a atualização automática."
                  error={validation.find((error) => error.includes('polling'))}
                />
              </div>

              <div className="rounded-lg border border-line/70 bg-elevated/25 px-3 py-2.5">
                <Toggle
                  checked={draft.forceDemo}
                  onChange={(checked) =>
                    setDraft((current) => ({ ...current, forceDemo: checked }))
                  }
                  label="Forçar modo demonstração"
                  description="Ignora a API e usa o gerador determinístico local. Útil para apresentações sem backend."
                />
              </div>

              {testResult ? (
                <div
                  className={cx(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px]',
                    testResult.ok
                      ? 'border-brand/25 bg-brand/8 text-muted'
                      : 'border-danger/25 bg-danger/8 text-muted',
                  )}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  )}
                  <span>
                    {testResult.ok
                      ? `Conexão estabelecida em ${testResult.latencyMs} ms.`
                      : testResult.error ?? 'Falha ao conectar.'}
                  </span>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                  {online === true ? (
                    <Wifi className="h-3.5 w-3.5 text-brand" />
                  ) : (
                    <CloudOff className="h-3.5 w-3.5 text-warn" />
                  )}
                  {online === true
                    ? `Conectado${latencyMs !== null ? ` · ${latencyMs} ms` : ''}`
                    : healthError ?? 'Aguardando conexão.'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={HeartPulse}
                    onClick={testConnection}
                    loading={testing}
                  >
                    Testar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    onClick={saveConnection}
                    disabled={!dirty || validation.length > 0}
                  >
                    Salvar conexão
                  </Button>
                </div>
              </div>

              {validation.length > 0 ? (
                <div className="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2">
                  {validation.map((error) => (
                    <p key={error} className="text-[10px] text-muted">
                      · {error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Activity}
              title="Estado da conexão"
              description="Última verificação de saúde conhecida."
            />
            <div className="mt-3">
              <div
                className={cx(
                  'rounded-xl border px-3 py-3',
                  online === true
                    ? 'border-brand/25 bg-brand/5'
                    : online === false
                      ? 'border-warn/25 bg-warn/5'
                      : 'border-line bg-elevated/25',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="label">API</span>
                  {online === true ? (
                    <Wifi className="h-4 w-4 text-brand" />
                  ) : online === false ? (
                    <CloudOff className="h-4 w-4 text-warn" />
                  ) : (
                    <Activity className="h-4 w-4 text-muted" />
                  )}
                </div>
                <p className="mono mt-2 text-sm font-semibold text-ink">
                  {online === true ? 'online' : online === false ? 'offline' : 'verificando'}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {latencyMs !== null ? `latência ${latencyMs} ms` : 'sem medição'}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-0.5">
              <InfoRow label="URL" value={settings.apiUrl} mono />
              <InfoRow label="Timeout" value={`${settings.timeout} ms`} mono />
              <InfoRow label="Polling" value={`${settings.pollInterval} s`} mono />
              <InfoRow
                label="Modo demonstração"
                value={settings.forceDemo ? 'ativo' : 'desativado'}
              />
              <InfoRow
                label="Fonte de experimentos"
                value={<SourceBadge source={experimentsSource} />}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              icon={ExternalLink}
              onClick={() => window.open(`${settings.apiUrl}/docs`, '_blank', 'noopener')}
            >
              Abrir /docs
            </Button>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader
              icon={Palette}
              title="Aparência"
              description="Tema e densidade da interface."
              actions={<Badge tone="brand">{resolvedTheme}</Badge>}
            />
            <div className="mt-3 grid gap-2">
              {THEMES.map((theme) => {
                const Icon = theme.icon;
                const active = settings.theme === theme.value;
                return (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => updateSettings({ theme: theme.value })}
                    className={cx(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition',
                      active
                        ? 'border-brand/35 bg-brand/5'
                        : 'border-line/70 bg-elevated/20 hover:border-brand/25',
                    )}
                  >
                    <span
                      className={cx(
                        'grid h-7 w-7 place-items-center rounded-lg border',
                        active
                          ? 'border-brand/25 bg-brand/10 text-brand'
                          : 'border-line bg-elevated/40 text-muted',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-ink">
                        {theme.label}
                      </span>
                      <span className="block text-[9px] text-muted">{theme.description}</span>
                    </span>
                    {active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-t border-line/60 pt-3">
              <Toggle
                checked={settings.compact}
                onChange={(checked) => updateSettings({ compact: checked })}
                label="Densidade compacta"
                description="Reduz o espaçamento dos cards para telas pequenas."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={SlidersHorizontal}
              title="Limiares de drift"
              description="Configuração ativa dos métodos estatísticos."
              actions={
                <Badge tone={thresholdsCustomized ? 'warn' : 'brand'} dot>
                  {thresholdsCustomized ? 'personalizado' : 'padrão'}
                </Badge>
              }
            />
            <div className="mt-3 space-y-2">
              {[
                ['PSI', thresholds.psi.warning, thresholds.psi.critical],
                ['KS (p-valor)', thresholds.ks.warning, thresholds.ks.critical],
                ['Jensen-Shannon', thresholds.js.warning, thresholds.js.critical],
                ['Wasserstein', thresholds.wasserstein.warning, thresholds.wasserstein.critical],
              ].map(([label, warning, critical]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-lg border border-line/60 bg-elevated/25 px-2.5 py-1.5"
                >
                  <span className="text-[10px] text-muted">{label}</span>
                  <span className="mono text-[10px] text-ink">
                    {formatDecimal(warning as number, 2)} /{' '}
                    {formatDecimal(critical as number, 2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-0.5 border-t border-line/60 pt-2">
              <InfoRow label="Gatilho" value={thresholds.trigger_severity} />
              <InfoRow label="Amostra mínima" value={String(thresholds.min_samples)} mono />
              <InfoRow label="Bins PSI / JS" value={`${thresholds.psi_bins} / ${thresholds.js_bins}`} mono />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Link href="/drift#limiares" className="flex-1">
                <Button variant="secondary" size="sm" icon={Settings2} className="w-full">
                  Editar limiares
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={resetThresholds}
                title="Restaurar limiares padrão"
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Database}
              title="Dados locais"
              description="Exportação, sincronização e limpeza de preferências."
            />
            <div className="mt-3 space-y-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                className="w-full justify-start"
                onClick={exportSnapshot}
              >
                Exportar snapshot JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                className="w-full justify-start"
                onClick={refreshAll}
              >
                Sincronizar agora
              </Button>
              <Link href="/experimentos" className="block">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Database}
                  className="w-full justify-start"
                >
                  Gerenciar experimentos
                </Button>
              </Link>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                className="w-full justify-start"
                onClick={() => setResetOpen(true)}
              >
                Restaurar configurações
              </Button>
            </div>
            <div className="mt-3 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
              <p className="flex items-center gap-1 font-medium text-ink">
                <Sparkles className="h-3 w-3 text-brand" />
                O que é persistido?
              </p>
              <p className="mt-1">
                Tema, conexão, polling, limiares, experimento selecionado e alertas resolvidos
                ficam no <span className="mono text-ink">localStorage</span> deste navegador.
              </p>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            icon={Gauge}
            title="Sobre a plataforma"
            description="Stack e referências técnicas exibidas no dashboard."
            actions={<Badge tone="info">v1.0.0</Badge>}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: 'Frontend',
                detail: 'Next.js 14 · TypeScript · Tailwind · Recharts',
                icon: Monitor,
              },
              {
                title: 'Backend',
                detail: 'FastAPI · Uvicorn · Pydantic · SQLAlchemy',
                icon: Server,
              },
              {
                title: 'Dados & ML',
                detail: 'PaySim · XGBoost · PSI · KS · JS · Wasserstein',
                icon: Database,
              },
              {
                title: 'Infra',
                detail: 'Docker Compose · PostgreSQL 15 · PgAdmin opcional',
                icon: ShieldAlert,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-line/70 bg-elevated/25 p-3"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-surface text-brand">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="mt-2 text-xs font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{item.detail}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-[10px] text-muted">
            <span>
              Health check automático a cada{' '}
              <span className="mono text-ink">45 s</span> · {experiments.length} experimentos
              carregados
            </span>
            <div className="flex items-center gap-2">
              <Badge tone="brand">D5 · Dashboard</Badge>
              <Badge tone="info">D4 · API</Badge>
              <Badge tone="warn">D8 · Docs</Badge>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Restaurar configurações"
        description="Preferências, conexão e limiares voltam aos valores padrão."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              onClick={() => {
                resetSettings();
                setResetOpen(false);
                setTestResult(null);
              }}
            >
              Restaurar
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-muted">
          O experimento selecionado e os dados simulados não são apagados. As preferências voltam
          para o tema escuro, API <span className="mono text-ink">{DEFAULT_SETTINGS.apiUrl}</span> e
          limiares padrão do backend.
        </p>
      </Modal>
    </>
  );
}
