'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, LayoutDashboard } from 'lucide-react';
import { Card } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-brand/25 bg-brand/10 text-brand">
          <Compass className="h-6 w-6" />
        </span>
        <p className="mono mt-4 text-4xl font-semibold text-ink">404</p>
        <h1 className="mt-2 text-lg font-semibold text-ink">Página não encontrada</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          A rota solicitada não existe no dashboard. Use a navegação lateral ou volte para a visão
          geral do monitoramento.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="btn btn-primary bg-brand text-[rgb(var(--brand-contrast))] hover:bg-brand/90"
          >
            <LayoutDashboard className="h-4 w-4" />
            Visão geral
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="btn border border-line bg-elevated text-ink hover:border-brand/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
      </Card>
    </div>
  );
}
