'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  PlugZap,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react';
import { EndpointDefinition } from '@/data/platform';
import { API_ENDPOINTS } from '@/data/platform';
import { cx } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { api, apiErrorMessage } from '@/services/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  JsonView,
  Modal,
} from '@/components/ui';

const METHOD_STYLES: Record<EndpointDefinition['method'], string> = {
  GET: 'border-brand/25 bg-brand/10 text-brand',
  POST: 'border-info/25 bg-info/10 text-info',
  PATCH: 'border-warn/25 bg-warn/10 text-warn',
  DELETE: 'border-danger/25 bg-danger/10 text-danger',
};

interface TestResult {
  endpoint: EndpointDefinition;
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export function EndpointExplorer() {
  const { selectedExperimentId, online } = useApp();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = API_ENDPOINTS.filter(
      (endpoint) =>
        !normalized ||
        endpoint.path.toLowerCase().includes(normalized) ||
        endpoint.group.toLowerCase().includes(normalized) ||
        endpoint.description.toLowerCase().includes(normalized),
    );
    const map = new Map<string, EndpointDefinition[]>();
    for (const endpoint of filtered) {
      map.set(endpoint.group, [...(map.get(endpoint.group) ?? []), endpoint]);
    }
    return Array.from(map.entries());
  }, [query]);

  const run = async (endpoint: EndpointDefinition) => {
    if (!endpoint.testable) return;
    setLoadingPath(`${endpoint.method} ${endpoint.path}`);
    const started = performance.now();
    try {
      let data: unknown;
      if (endpoint.testable === 'health') {
        data = await api.health();
      } else if (endpoint.testable === 'thresholds') {
        data = await api.drift.thresholds();
      } else if (endpoint.testable === 'experiments') {
        data = await api.experiments.list({ limit: 5 });
      } else {
        data = await api.drift.summary(selectedExperimentId ?? 1);
      }
      setResult({
        endpoint,
        ok: true,
        data,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      setResult({
        endpoint,
        ok: false,
        error: apiErrorMessage(error),
        durationMs: Math.round(performance.now() - started),
      });
    } finally {
      setLoadingPath(null);
    }
  };

  const testableCount = API_ENDPOINTS.filter((endpoint) => endpoint.testable).length;

  return (
    <>
      <Card>
        <CardHeader
          icon={PlugZap}
          title="Explorador de endpoints"
          description="Consulte o contrato da API e execute chamadas reais contra a instância configurada."
          actions={
            <Badge tone={online ? 'brand' : 'warn'} dot>
              {online ? 'conectado' : 'offline'}
            </Badge>
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar path, grupo ou descrição…"
              aria-label="Buscar endpoint"
              className="field h-8 pl-8 text-xs"
            />
          </div>
          <Badge tone="neutral">{API_ENDPOINTS.length} rotas</Badge>
          <Badge tone="info">{testableCount} testáveis</Badge>
        </div>

        <div className="mt-3 space-y-3">
          {groups.length === 0 ? (
            <EmptyState
              icon={Terminal}
              title="Nenhum endpoint encontrado"
              description="Tente outro termo de busca."
              className="py-8"
            />
          ) : (
            groups.map(([group, endpoints]) => (
              <div key={group}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="label">{group}</span>
                  <span className="text-[9px] text-muted">{endpoints.length}</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-line/70">
                  <table className="data-table">
                    <tbody>
                      {endpoints.map((endpoint) => {
                        const key = `${endpoint.method} ${endpoint.path}`;
                        return (
                          <tr key={key}>
                            <td className="w-16">
                              <span
                                className={cx(
                                  'badge border !px-1.5 !py-0 !text-[9px] mono',
                                  METHOD_STYLES[endpoint.method],
                                )}
                              >
                                {endpoint.method}
                              </span>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <Code2 className="h-3 w-3 shrink-0 text-muted" />
                                <span className="mono text-xs text-ink">{endpoint.path}</span>
                                <CopyButton
                                  value={endpoint.path}
                                  label=""
                                  className="!h-5 !px-1 opacity-0 transition group-hover:opacity-100"
                                />
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted">
                                {endpoint.description}
                              </p>
                            </td>
                            <td className="w-24 text-right">
                              {endpoint.testable ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={PlugZap}
                                  loading={loadingPath === key}
                                  onClick={() => run(endpoint)}
                                >
                                  Testar
                                </Button>
                              ) : (
                                <CopyButton value={endpoint.path} label="Path" className="!h-6" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line/60 bg-elevated/20 px-2.5 py-2 text-[10px] text-muted">
          <Copy className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span>
            Base URL configurada em <span className="mono text-ink">Configurações → Conexão</span>.
            Swagger interativo em <span className="mono text-ink">/docs</span> quando o backend está
            em execução.
          </span>
        </div>
      </Card>

      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        title={result ? `${result.endpoint.method} ${result.endpoint.path}` : 'Resposta'}
        description={result?.endpoint.description}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setResult(null)}>
            Fechar
          </Button>
        }
      >
        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {result.ok ? (
                <Badge tone="brand" dot icon={CheckCircle2}>
                  sucesso
                </Badge>
              ) : (
                <Badge tone="danger" dot icon={XCircle}>
                  falha
                </Badge>
              )}
              <Badge tone="neutral">
                <Clock3 className="h-3 w-3" /> {result.durationMs} ms
              </Badge>
              {online ? null : (
                <span className="text-[10px] text-warn">
                  API marcada como offline — a chamada foi tentada mesmo assim.
                </span>
              )}
            </div>
            {result.ok ? (
              <JsonView data={result.data} />
            ) : (
              <div className="rounded-xl border border-danger/25 bg-danger/8 px-3 py-2 text-[11px] leading-relaxed text-muted">
                {result.error}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
