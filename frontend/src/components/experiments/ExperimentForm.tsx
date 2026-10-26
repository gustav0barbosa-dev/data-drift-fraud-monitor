'use client';

import React, { useEffect, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import {
  DriftLevel,
  ExperimentCreatePayload,
} from '@/types';
import { DRIFT_LEVEL_META } from '@/lib/utils';
import {
  Button,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';

const DRIFT_OPTIONS: DriftLevel[] = ['none', 'low', 'moderate', 'high'];

export function ExperimentForm({
  open,
  onClose,
  onSubmit,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ExperimentCreatePayload) => Promise<void>;
  loading?: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [driftLevel, setDriftLevel] = useState<DriftLevel>('moderate');
  const [windows, setWindows] = useState(12);
  const [windowSize, setWindowSize] = useState(12400);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setDriftLevel('moderate');
    setWindows(12);
    setWindowSize(12400);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (name.trim().length < 3) {
      setError('Informe um nome com pelo menos 3 caracteres.');
      return;
    }
    if (windows < 1 || windows > 52) {
      setError('O número de janelas deve estar entre 1 e 52.');
      return;
    }
    if (windowSize < 100) {
      setError('Cada janela precisa de pelo menos 100 registros.');
      return;
    }
    setError(null);
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      drift_level: driftLevel,
      config: {
        scenario: `E-custom-${Date.now().toString().slice(-4)}`,
        windows,
        window_size: windowSize,
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo experimento"
      description="Configure o cenário de drift e as janelas de monitoramento."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Plus} onClick={submit} loading={loading}>
            Criar experimento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 px-3 py-2 text-[10px] leading-relaxed text-muted">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          <span>
            Com a API online o experimento é persistido no PostgreSQL. Sem API, ele é criado
            apenas neste navegador para exploração do dashboard.
          </span>
        </div>

        <Input
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="E5 — Drift sazonal no fim de semana"
          hint="Use um nome curto e identificável."
        />

        <Textarea
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Objetivo do experimento, hipótese e critério de sucesso."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Nível de drift"
            value={driftLevel}
            onChange={(event) => setDriftLevel(event.target.value as DriftLevel)}
          >
            {DRIFT_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {DRIFT_LEVEL_META[level].label}
              </option>
            ))}
          </Select>
          <Input
            label="Janelas"
            type="number"
            min={1}
            max={52}
            value={windows}
            onChange={(event) => setWindows(Number(event.target.value))}
            className="mono"
            suffix="sem."
          />
        </div>

        <Input
          label="Registros por janela"
          type="number"
          min={100}
          step={100}
          value={windowSize}
          onChange={(event) => setWindowSize(Number(event.target.value))}
          className="mono"
          hint="No PaySim, uma janela semanal costuma ter cerca de 12.400 transações."
        />

        <div className="rounded-lg border border-line/70 bg-elevated/25 px-3 py-2">
          <p className="label mb-1">Cenário selecionado</p>
          <p className="text-xs font-medium text-ink">
            {DRIFT_LEVEL_META[driftLevel].label}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
            {DRIFT_LEVEL_META[driftLevel].description}
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[10px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
