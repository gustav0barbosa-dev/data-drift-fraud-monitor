'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { DriftThresholds, MethodKey, Severity } from '@/types';
import { DEFAULT_THRESHOLDS, THRESHOLD_HELP, cloneThresholds } from '@/data/thresholds';
import { METHOD_META, cx, formatDecimal } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Select,
  Toggle,
} from '@/components/ui';

type MethodThresholdKey = Extract<MethodKey, 'psi' | 'ks' | 'js' | 'wasserstein'>;
const METHODS: MethodThresholdKey[] = ['psi', 'ks', 'js', 'wasserstein'];

function validateThresholds(thresholds: DriftThresholds): string[] {
  const errors: string[] = [];
  for (const key of METHODS) {
    const rule = thresholds[key];
    if (!Number.isFinite(rule.warning) || !Number.isFinite(rule.critical)) {
      errors.push(`${METHOD_META[key].short}: informe valores numéricos.`);
    }
    if (rule.warning < 0 || rule.critical < 0) {
      errors.push(`${METHOD_META[key].short}: os limiares não podem ser negativos.`);
    }
    if (rule.direction === 'above' && rule.warning >= rule.critical) {
      errors.push(
        `${METHOD_META[key].short}: o limiar de atenção deve ser menor que o crítico.`,
      );
    }
    if (rule.direction === 'below' && rule.warning <= rule.critical) {
      errors.push(
        `${METHOD_META[key].short}: o p-valor de atenção deve ser maior que o crítico.`,
      );
    }
  }
  if (thresholds.min_samples < 2 || thresholds.min_samples > 100000) {
    errors.push('Amostra mínima deve estar entre 2 e 100.000.');
  }
  if (thresholds.psi_bins < 2 || thresholds.psi_bins > 100) {
    errors.push('O número de bins do PSI deve estar entre 2 e 100.');
  }
  if (thresholds.js_bins < 2 || thresholds.js_bins > 100) {
    errors.push('O número de bins do JS deve estar entre 2 e 100.');
  }
  return errors;
}

export function ThresholdEditor() {
  const {
    thresholds,
    updateThresholds,
    resetThresholds,
    thresholdsCustomized,
  } = useApp();
  const [draft, setDraft] = useState<DriftThresholds>(() => cloneThresholds(thresholds));
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    setDraft(cloneThresholds(thresholds));
  }, [thresholds]);

  const errors = useMemo(() => validateThresholds(draft), [draft]);
  const changed = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(thresholds),
    [draft, thresholds],
  );

  const setRule = (
    method: MethodThresholdKey,
    field: 'warning' | 'critical',
    value: number,
  ) => {
    setDraft((current) => ({
      ...current,
      [method]: { ...current[method], [field]: value },
    }));
    setSaveState('idle');
  };

  const save = () => {
    if (errors.length > 0) return;
    updateThresholds(draft);
    setSaveState('saved');
    window.setTimeout(() => setSaveState('idle'), 2200);
  };

  return (
    <Card>
      <CardHeader
        icon={SlidersHorizontal}
        title="Editor de limiares"
        description="Ajuste a sensibilidade dos métodos. As alterações valem para o dashboard inteiro."
        actions={
          <Badge tone={thresholdsCustomized ? 'warn' : 'brand'} dot>
            {thresholdsCustomized ? 'personalizado' : 'padrão'}
          </Badge>
        }
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {METHODS.map((method) => {
          const meta = METHOD_META[method];
          const rule = draft[method];
          const help = THRESHOLD_HELP[method];
          return (
            <div
              key={method}
              className="rounded-xl border border-line/70 bg-elevated/25 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: meta.color }}
                  />
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      {meta.short}{' '}
                      <span className="font-normal text-muted">· {meta.label}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                      {help.note}
                    </p>
                  </div>
                </div>
                <Badge tone="neutral" className="!text-[9px]">
                  {rule.direction === 'above' ? 'acima' : 'abaixo'}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input
                  label={rule.direction === 'above' ? 'Atenção (≥)' : 'Atenção (≤)'}
                  type="number"
                  min={0}
                  step={0.01}
                  value={rule.warning}
                  onChange={(event) => setRule(method, 'warning', Number(event.target.value))}
                  className="h-9 text-xs mono"
                />
                <Input
                  label={rule.direction === 'above' ? 'Crítico (≥)' : 'Crítico (≤)'}
                  type="number"
                  min={0}
                  step={0.01}
                  value={rule.critical}
                  onChange={(event) => setRule(method, 'critical', Number(event.target.value))}
                  className="h-9 text-xs mono"
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-muted">
                <span>
                  faixa estável:{' '}
                  {rule.direction === 'above'
                    ? `< ${formatDecimal(rule.warning, 2)}`
                    : `> ${formatDecimal(rule.warning, 2)}`}
                </span>
                <span>
                  atual:{' '}
                  <span className="mono text-ink">
                    {rule.direction === 'above' ? '≥' : '≤'} {formatDecimal(rule.critical, 2)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 rounded-xl border border-line/70 bg-elevated/25 p-3 md:grid-cols-3">
        <Select
          label="Severidade de gatilho"
          value={draft.trigger_severity}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              trigger_severity: event.target.value as Severity,
            }))
          }
          className="h-9 text-xs"
        >
          <option value="warning">Atenção</option>
          <option value="critical">Crítico</option>
        </Select>
        <Input
          label="Amostra mínima"
          type="number"
          min={2}
          value={draft.min_samples}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              min_samples: Number(event.target.value),
            }))
          }
          className="h-9 text-xs mono"
          hint="mínimo de observações por janela"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Bins PSI"
            type="number"
            min={2}
            max={100}
            value={draft.psi_bins}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                psi_bins: Number(event.target.value),
              }))
            }
            className="h-9 text-xs mono"
          />
          <Input
            label="Bins JS"
            type="number"
            min={2}
            max={100}
            value={draft.js_bins}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                js_bins: Number(event.target.value),
              }))
            }
            className="h-9 text-xs mono"
          />
        </div>
      </div>

      <div className="mt-3">
        <Toggle
          checked={draft.trigger_severity === 'warning'}
          onChange={(checked) =>
            setDraft((current) => ({
              ...current,
              trigger_severity: checked ? 'warning' : 'critical',
            }))
          }
          label="Alertar já em atenção"
          description="Quando ativo, qualquer método em severidade de atenção emite alerta. O padrão conservador usa apenas o crítico."
        />
      </div>

      {errors.length > 0 ? (
        <div className="mt-3 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-danger">
            <AlertTriangle className="h-3.5 w-3.5" />
            Corrija antes de salvar
          </div>
          <ul className="mt-1 space-y-0.5">
            {errors.map((error) => (
              <li key={error} className="text-[10px] text-muted">
                · {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          {saveState === 'saved' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-brand" />
          )}
          {saveState === 'saved'
            ? 'Limiares aplicados ao dashboard.'
            : 'Salvos apenas neste navegador (localStorage).'}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              resetThresholds();
              setDraft(cloneThresholds(DEFAULT_THRESHOLDS));
            }}
          >
            Restaurar padrão
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            onClick={save}
            disabled={!changed || errors.length > 0}
          >
            Aplicar limiares
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {METHODS.map((method) => (
          <span
            key={method}
            className={cx(
              'badge border-line bg-elevated/40 text-muted',
              '!text-[9px]',
            )}
          >
            {METHOD_META[method].short} {formatDecimal(DEFAULT_THRESHOLDS[method].warning, 2)}/
            {formatDecimal(DEFAULT_THRESHOLDS[method].critical, 2)}
          </span>
        ))}
      </div>
    </Card>
  );
}
