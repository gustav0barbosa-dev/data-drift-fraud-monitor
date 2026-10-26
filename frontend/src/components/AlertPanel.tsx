'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  CircleDot,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  Wrench,
} from 'lucide-react';
import { Alert } from '@/types';
import { ALERT_SEVERITY_META, cx, timeAgo } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardHeader, EmptyState, LinkArrow } from '@/components/ui';

const ALERT_TYPE_META: Record<string, { label: string; icon: typeof Bell }> = {
  drift_detected: { label: 'Drift detectado', icon: ShieldAlert },
  performance_degradation: { label: 'Degradação de performance', icon: TrendingDown },
  retrain_triggered: { label: 'Retreinamento disparado', icon: Wrench },
  retrain_completed: { label: 'Retreinamento concluído', icon: CheckCircle2 },
  threshold_exceeded: { label: 'Limiar excedido', icon: CircleDot },
  monitoring: { label: 'Monitoramento', icon: Bell },
};

export function AlertPanel({
  alerts,
  className,
  limit,
  includeResolved = false,
  showHeader = true,
  dense = false,
}: {
  alerts: Alert[];
  className?: string;
  limit?: number;
  includeResolved?: boolean;
  showHeader?: boolean;
  dense?: boolean;
}) {
  const { resolveAlert } = useApp();
  const [severityFilter, setSeverityFilter] = useState<'all' | Alert['severity']>('all');

  const filtered = useMemo(() => {
    const base = includeResolved ? alerts : alerts.filter((alert) => !alert.isResolved);
    const severity = severityFilter === 'all'
      ? base
      : base.filter((alert) => alert.severity === severityFilter);
    return limit ? severity.slice(0, limit) : severity;
  }, [alerts, includeResolved, limit, severityFilter]);

  const activeCount = alerts.filter((alert) => !alert.isResolved).length;
  const criticalCount = alerts.filter(
    (alert) => !alert.isResolved && alert.severity === 'critical',
  ).length;

  const counts = {
    all: includeResolved ? alerts.length : activeCount,
    critical: alerts.filter(
      (alert) => (includeResolved || !alert.isResolved) && alert.severity === 'critical',
    ).length,
    warning: alerts.filter(
      (alert) => (includeResolved || !alert.isResolved) && alert.severity === 'warning',
    ).length,
    info: alerts.filter(
      (alert) => (includeResolved || !alert.isResolved) && alert.severity === 'info',
    ).length,
  };

  return (
    <Card className={cx('flex flex-col', className)}>
      {showHeader ? (
        <CardHeader
          icon={Bell}
          title="Alertas"
          description={
            activeCount > 0
              ? `${activeCount} ativo${activeCount > 1 ? 's' : ''}${
                  criticalCount > 0 ? ` · ${criticalCount} crítico${criticalCount > 1 ? 's' : ''}` : ''
                }`
              : 'Nenhum alerta ativo'
          }
          actions={
            <Link
              href="/drift#alertas"
              className="text-2xs font-medium text-brand hover:underline"
            >
              Ver todos
            </Link>
          }
        />
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'Todos', counts.all],
            ['critical', 'Crítico', counts.critical],
            ['warning', 'Atenção', counts.warning],
            ['info', 'Info', counts.info],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSeverityFilter(value)}
            className={cx(
              'rounded-full border px-2.5 py-1 text-2xs font-medium transition',
              severityFilter === value
                ? 'border-brand/35 bg-brand/10 text-brand'
                : 'border-line bg-elevated/50 text-muted hover:text-ink',
            )}
          >
            {label}
            <span className="mono ml-1 opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nada exigindo ação"
            description="Nenhum alerta corresponde ao filtro selecionado."
            className="py-8"
          />
        ) : (
          filtered.map((alert) => {
            const meta = ALERT_TYPE_META[alert.type] ?? ALERT_TYPE_META.monitoring;
            const Icon = meta.icon;
            const severity = ALERT_SEVERITY_META[alert.severity];
            const criticalFeatures = Array.isArray(alert.metadata.critical_features)
              ? (alert.metadata.critical_features as string[])
              : [];
            const warningFeatures = Array.isArray(alert.metadata.warning_features)
              ? (alert.metadata.warning_features as string[])
              : [];

            return (
              <div
                key={alert.id}
                className={cx(
                  'rounded-xl border px-3 py-2.5 transition',
                  alert.isResolved
                    ? 'border-line/60 bg-elevated/20 opacity-65'
                    : 'border-line bg-elevated/35 hover:border-line',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cx(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
                      severity.badge,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cx('badge border', severity.badge)}>
                        {severity.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted">
                        {meta.label}
                      </span>
                      {alert.isResolved ? (
                        <span className="text-[10px] text-brand">resolvido</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink">{alert.message}</p>

                    {criticalFeatures.length > 0 || warningFeatures.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {criticalFeatures.slice(0, 3).map((feature) => (
                          <Badge key={feature} tone="danger" className="!py-0 !text-[9px]">
                            {feature}
                          </Badge>
                        ))}
                        {warningFeatures.slice(0, 2).map((feature) => (
                          <Badge key={feature} tone="warn" className="!py-0 !text-[9px]">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {!dense ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted">
                          {timeAgo(alert.triggeredAt)}
                          {typeof alert.metadata.window === 'string'
                            ? ` · janela ${alert.metadata.window}`
                            : ''}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!h-6 !px-1.5 !text-[10px]"
                          icon={alert.isResolved ? RotateCcw : CheckCircle2}
                          onClick={() => resolveAlert(alert.id, !alert.isResolved)}
                        >
                          {alert.isResolved ? 'Reabrir' : 'Resolver'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {limit && alerts.length > limit ? (
        <Link href="/drift#alertas" className="mt-3 self-end">
          <LinkArrow>{alerts.length - limit} alertas adicionais</LinkArrow>
        </Link>
      ) : null}
    </Card>
  );
}
