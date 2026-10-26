# Frontend · Data Drift Fraud Monitor

Dashboard em **Next.js 14 (Pages Router) + TypeScript + Tailwind CSS + Recharts** para monitorar
Data Drift e a degradação do modelo XGBoost de detecção de fraude (PaySim). O frontend consome a
API FastAPI (`/api/v1/...`) quando ela está disponível e, caso contrário, opera com uma base
**determinística** de demonstração — a interface nunca quebra por falta de backend.

## Como executar

```bash
npm install
npm run dev        # http://localhost:3000
```

Build de produção:

```bash
npm run build
npm run start      # http://localhost:3000
```

Verificações:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # next lint (configuração interativa na primeira execução)
```

### Variável de ambiente

| Variável              | Padrão                  | Descrição                                        |
| --------------------- | ----------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL da API FastAPI (pode ser trocada na UI) |

A URL também pode ser alterada em **Configurações → Conexão**, que persiste em `localStorage`
(`dd_settings_v1`) e passa a valer imediatamente, sem rebuild.

## Rotas

| Rota             | Alias (PDF)   | Frente      | Conteúdo                                                             |
| ---------------- | ------------- | ----------- | -------------------------------------------------------------------- |
| `/`              | `index.tsx`   | P3          | Visão geral: KPIs, performance, drift, alertas, pipeline E1–E4       |
| `/drift`         | —             | P2          | PSI/KS/JS/Wasserstein por feature, limiares, alertas, E3, sandbox     |
| `/modelo`        | —             | P1          | Modelo, dataset, importância de features, simulador, retreinamento    |
| `/experimentos`  | `/experiments`| E1–E4       | CRUD e ciclo de vida dos experimentos e cenários de drift            |
| `/sistema`       | —             | P3          | Saúde da API, serviços Docker, endpoints, schema PostgreSQL           |
| `/configuracoes` | `/settings`   | P3          | Conexão, tema, limiares padrão, preferências de dados                |

Componentes exigidos pelo documento: `Dashboard.tsx`, `MetricsChart.tsx`, `DriftChart.tsx`,
`AlertPanel.tsx` e `FeatureDrift.tsx` (todos em `src/components`).

## Modos de dados

1. **Live** — `online === true` e a API responde: séries, resumo e alertas vêm de
   `/api/v1/drift/...` e `/api/v1/metrics/...`.
2. **Híbrido** — `source: 'mixed'`: usa o que a API entregou e completa o restante com demo.
3. **Demo** — API offline, `forceDemo` ativo ou `experimentsSource === 'demo'`: dados simulados
   determinísticos (`src/data/mock.ts`), com o mesmo contrato de tipos da API.

O selo **Demo/Online** no topo e o `SourceBadge` no banner do experimento indicam a origem atual.
O polling é configurável em Configurações (`pollInterval`), e experimentos de demonstração nunca
são enviados para a API.

## Estatística no cliente

`src/lib/drift.ts` reimplementa em TypeScript os métodos usados pelo backend, para o sandbox
funcionar offline:

- **PSI** com bins de referência;
- **KS** (estatística D + p-valor assintótico);
- **Jensen-Shannon** com correção de viés;
- **Wasserstein** normalizado pelo desvio-padrão da referência.

Os resultados reais do experimento **E3** (`backend/experiments/results/e3/e3_results.json`) estão
embutidos em `src/data/e3.ts` para a comparação de sensibilidade entre métodos.

## Estrutura

```
src/
├── components/
│   ├── Dashboard.tsx · MetricsChart.tsx · DriftChart.tsx
│   ├── AlertPanel.tsx · FeatureDrift.tsx
│   ├── charts/          # wrappers Recharts (área, linha, barras, donut, sparkline)
│   ├── drift/           # FeatureDetailDrawer, ThresholdEditor, E3Comparison, DriftSandbox
│   ├── experiments/     # ExperimentTable, ExperimentForm
│   ├── layout/          # AppShell (sidebar, topbar, seletor de experimento)
│   ├── model/           # ModelCard, DatasetCard, FeatureImportanceCard, SimulatorPanel, RetrainPanel
│   ├── system/          # EndpointExplorer, SchemaBrowser
│   └── ui/              # primitivas (Card, Badge, Button, KPI, tabela, drawer, toast…)
├── context/AppContext   # settings, experimentos, limiares, alertas, retreinos, toasts
├── hooks/useMonitorData # composição live + demo
├── data/                # mock determinístico, limiares, E3, metadados da plataforma
├── lib/                 # utils, PRNG, implementações estatísticas
├── services/api.ts      # cliente axios tipado do contrato FastAPI
├── styles/globals.css   # design system (tema escuro/claro via CSS variables)
└── types/               # contrato compartilhado com o backend
```

## Entregas por persona

| Persona                  | Entregas na interface                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| **Pessoa 1 · ML & Dados**| `/modelo`: modelo ativo, dataset, importância de features, simulador de drift, retreinamento |
| **Pessoa 2 · Drift & Estatística** | `/drift`: quatro métodos por feature, limiares editáveis, alertas, E3, sandbox estatístico |
| **Pessoa 3 · Software & Fullstack** | `/`: dashboard, `/sistema`: API/Docker/schema, `/configuracoes`: conexão e preferências, `/experimentos`: ciclo de vida |

## Docker

`Dockerfile` usa build multi-stage com `output: 'standalone'` (imagem final sem `node_modules` de
desenvolvimento). O serviço `frontend` do `docker-compose.yml` expõe a porta `3000`.

```bash
docker-compose up --build frontend
```
