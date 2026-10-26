'use client';

import React from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Container,
  Cpu,
  Database,
  ExternalLink,
  FileJson,
  GitBranch,
  Globe2,
  HeartPulse,
  Layers,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  API_ENDPOINTS,
  DOCKER_SERVICES,
  QUICK_COMMANDS,
  TEAM,
  DELIVERABLES,
} from '@/data/platform';
import {
  cx,
  formatDateTime,
  formatNumber,
} from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  InfoRow,
  KpiCard,
  PageHeader,
  PersonaChip,
} from '@/components/ui';
import { EndpointExplorer } from '@/components/system/EndpointExplorer';
import { SchemaBrowser } from '@/components/system/SchemaBrowser';

function componentTone(value: string | undefined): 'brand' | 'warn' | 'danger' | 'neutral' {
  if (!value) return 'neutral';
  const normalized = value.toLowerCase();
  if (
    normalized.includes('ok') ||
    normalized.includes('up') ||
    normalized.includes('healthy') ||
    normalized.includes('loaded') ||
    normalized.includes('operational')
  ) {
    return 'brand';
  }
  if (normalized.includes('error') || normalized.includes('down') || normalized.includes('fail')) {
    return 'danger';
  }
  return 'warn';
}

export default function SystemPage() {
  const {
    online,
    health,
    latencyMs,
    healthError,
    checkHealth,
    settings,
    selectedExperiment,
  } = useApp();

  const healthTimestamp = health?.timestamp
    ? new Date(health.timestamp * 1000).toISOString()
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Pessoa 3 · Plataforma"
        persona="Pessoa 3"
        title="Sistema, API e infraestrutura"
        description="Saúde dos serviços, contrato REST, schema PostgreSQL, containers Docker e comandos de operação da plataforma experimental."
        actions={
          <>
            <Button
              variant="outline"
              icon={BookOpen}
              onClick={() => window.open(`${settings.apiUrl}/docs`, '_blank', 'noopener')}
            >
              Swagger /docs
            </Button>
            <Button variant="primary" icon={HeartPulse} onClick={checkHealth}>
              Verificar saúde
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="API FastAPI"
            value={online === true ? 'online' : online === false ? 'offline' : '…'}
            icon={Server}
            hint={health?.version ? `versão ${health.version}` : 'health check periódico'}
            tone={online === true ? 'brand' : online === false ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Latência"
            value={latencyMs !== null ? `${latencyMs} ms` : '—'}
            icon={Clock3}
            hint="última chamada a /health"
            tone="info"
          />
          <KpiCard
            label="PostgreSQL"
            value={health?.components.database ?? (online ? 'verificando' : 'offline')}
            icon={Database}
            hint="container drift-monitor-db"
            tone={componentTone(health?.components.database)}
          />
          <KpiCard
            label="Modelo"
            value={health?.components.model ?? (online ? '—' : 'offline')}
            icon={Cpu}
            hint="artefato XGBoost carregado"
            tone={componentTone(health?.components.model)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              icon={HeartPulse}
              title="Saúde da plataforma"
              description={`Endpoint base: ${settings.apiUrl}/health`}
              actions={
                <div className="flex items-center gap-1.5">
                  <Badge tone={online === true ? 'brand' : online === false ? 'warn' : 'neutral'} dot>
                    {online === true ? 'conectado' : online === false ? 'sem conexão' : 'verificando'}
                  </Badge>
                  <Button variant="ghost" size="sm" icon={RefreshCw} onClick={checkHealth}>
                    Atualizar
                  </Button>
                </div>
              }
            />

            {health ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['Banco', health.components.database, Database],
                      ['API', health.components.api, Server],
                      ['Modelo', health.components.model, Cpu],
                    ] as const
                  ).map(([label, value, Icon]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-line/70 bg-elevated/25 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[10px] text-muted">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </span>
                        <Badge tone={componentTone(value)} dot>
                          {value}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-line/70 bg-elevated/20 px-3 py-2">
                  <InfoRow label="Status geral" value={health.status} />
                  <InfoRow label="Versão da API" value={health.version} mono />
                  <InfoRow
                    label="Timestamp"
                    value={healthTimestamp ? formatDateTime(healthTimestamp) : '—'}
                  />
                  <InfoRow
                    label="Experimento selecionado"
                    value={selectedExperiment?.name ?? '—'}
                  />
                </div>
              </>
            ) : (
              <div className="mt-2">
                <EmptyState
                  icon={WifiOff}
                  title={online === false ? 'API indisponível' : 'Verificando conexão'}
                  description={
                    healthError ??
                    'Inicie o backend com docker compose ou aponte a URL em Configurações para consultar o health check.'
                  }
                  action={
                    <Button variant="outline" icon={RefreshCw} onClick={checkHealth}>
                      Tentar novamente
                    </Button>
                  }
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={Network}
              title="Arquitetura"
              description="Fluxo de dados entre interface, API e persistência."
            />
            <div className="mt-3 space-y-1.5">
              {[
                { label: 'Navegador', detail: 'React + Next.js 14', icon: Globe2 },
                { label: 'Frontend', detail: 'standalone · porta 3000', icon: Layers },
                { label: 'API', detail: 'FastAPI · porta 8000', icon: Server },
                { label: 'PostgreSQL', detail: '8 tabelas · porta 5432', icon: Database },
                { label: 'Modelo', detail: 'XGBoost · artefato JSON', icon: Cpu },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <div className="flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/25 px-2.5 py-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-line bg-surface text-brand">
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-ink">{item.label}</p>
                        <p className="truncate text-[9px] text-muted">{item.detail}</p>
                      </div>
                    </div>
                    {index < 4 ? (
                      <div className="flex justify-center py-0.5">
                        <ArrowRight className="h-3 w-3 rotate-90 text-line" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-info/20 bg-info/5 px-2.5 py-2 text-[10px] text-muted">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-info" />
              CORS liberado para o dashboard em desenvolvimento; produção deve restringir a origem.
            </div>
          </Card>
        </div>

        <EndpointExplorer />

        <SchemaBrowser />

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              icon={Container}
              title="Serviços Docker Compose"
              description="Stack completa com healthchecks e volumes persistentes."
              actions={
                <Badge tone="info">
                  {DOCKER_SERVICES.length} serviços
                </Badge>
              }
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DOCKER_SERVICES.map((service) => (
                <div
                  key={service.container}
                  className="rounded-xl border border-line/70 bg-elevated/25 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-ink">{service.name}</p>
                      <p className="mono mt-0.5 text-[9px] text-muted">{service.container}</p>
                    </div>
                    <Badge tone={service.optional ? 'neutral' : 'brand'} dot={!service.optional}>
                      {service.optional ? 'opcional' : 'essencial'}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                    {service.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone="info" className="!text-[9px]">
                      :{service.port}
                    </Badge>
                    <Badge tone="neutral" className="!text-[9px]">
                      {service.image}
                    </Badge>
                  </div>
                  {service.dependsOn ? (
                    <p className="mt-1.5 text-[9px] text-muted">
                      depende de <span className="mono text-ink">{service.dependsOn}</span>
                    </p>
                  ) : null}
                  {service.healthcheck ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] text-muted">
                      <CheckCircle2 className="h-2.5 w-2.5 text-brand" />
                      <span className="mono">{service.healthcheck}</span>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Terminal}
              title="Comandos rápidos"
              description="Operação local e execução dos experimentos."
            />
            <div className="mt-3 space-y-2">
              {QUICK_COMMANDS.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-line/60 bg-elevated/25 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-medium text-ink">{item.label}</p>
                    <CopyButton value={item.command} label="" className="!h-5 !px-1" />
                  </div>
                  <code className="mono mt-1 block overflow-x-auto whitespace-nowrap text-[9px] text-muted">
                    {item.command}
                  </code>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
              <FileJson className="h-3.5 w-3.5 text-brand" />
              Contrato completo em{' '}
              <span className="mono text-ink">docs/estrutura_API.md</span>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              icon={GitBranch}
              title="Time e entregáveis"
              description="Frentes de trabalho descritas no documento da plataforma."
              actions={
                <Badge tone="warn">
                  {API_ENDPOINTS.length} endpoints · {DELIVERABLES.length} entregáveis
                </Badge>
              }
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {TEAM.map((member) => (
                <div
                  key={member.name}
                  className="rounded-xl border border-line/70 bg-elevated/25 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        'grid h-7 w-7 place-items-center rounded-lg border text-[10px] font-semibold',
                        member.person === 'Pessoa 1'
                          ? 'border-brand/25 bg-brand/10 text-brand'
                          : member.person === 'Pessoa 2'
                            ? 'border-info/25 bg-info/10 text-info'
                            : 'border-warn/25 bg-warn/10 text-warn',
                      )}
                    >
                      {member.person.replace('Pessoa ', 'P')}
                    </span>
                    <PersonaChip person={member.person} compact />
                  </div>
                  <p className="mt-2 text-[11px] font-medium leading-tight text-ink">
                    {member.name}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">{member.role}</p>
                  <p className="mt-1.5 text-[9px] leading-relaxed text-muted">{member.tasks}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-line/60 pt-3">
              <div className="flex flex-wrap gap-1.5">
                {DELIVERABLES.map((item) => (
                  <Badge
                    key={item.id}
                    tone={
                      item.owner === 'Pessoa 1'
                        ? 'brand'
                        : item.owner === 'Pessoa 2'
                          ? 'info'
                          : item.owner === 'Pessoa 3'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {item.id} · {item.label}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={Activity}
              title="Capacidade da plataforma"
              description="Números do modelo e da base processada."
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['Transações', '6.362.620'],
                ['Features', '9'],
                ['Tabelas', '8'],
                ['Endpoints', String(API_ENDPOINTS.length)],
                ['Experimentos', '4'],
                ['Métodos drift', '4'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-line/60 bg-elevated/30 px-2.5 py-2"
                >
                  <p className="text-[9px] text-muted">{label}</p>
                  <p className="mono mt-1 text-sm font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-0.5 border-t border-line/60 pt-2">
              <InfoRow label="Modelo" value="XGBoost" />
              <InfoRow label="Dataset" value="PaySim" />
              <InfoRow label="Drift" value="PSI · KS · JS · W₁" />
              <InfoRow label="Frontend" value="Next.js 14" />
              <InfoRow label="Banco" value="PostgreSQL 15" />
              <InfoRow
                label="Total de endpoints"
                value={formatNumber(API_ENDPOINTS.length)}
                mono
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              icon={ExternalLink}
              onClick={() => window.open(`${settings.apiUrl}/docs`, '_blank', 'noopener')}
            >
              Abrir documentação interativa
            </Button>
          </Card>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-line/60 bg-elevated/20 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
          <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          <span>
            Stack de referência do PDF: React/Next.js + TypeScript + Recharts + Tailwind no
            frontend; FastAPI + PostgreSQL + XGBoost no backend. O dashboard degrada de forma
            controlada para dados simulados quando a API não responde.
          </span>
        </div>
      </div>
    </>
  );
}
