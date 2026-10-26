export interface SchemaColumn {
  name: string;
  type: string;
  key?: 'PK' | 'FK' | 'UNIQUE';
  nullable?: boolean;
  note?: string;
}

export interface SchemaTable {
  name: string;
  label: string;
  description: string;
  rows: string;
  columns: SchemaColumn[];
}

export const SCHEMA_TABLES: SchemaTable[] = [
  {
    name: 'experiments',
    label: 'Experimentos',
    description: 'Configuração e ciclo de vida dos experimentos científicos (E1–E4).',
    rows: '4',
    columns: [
      { name: 'id', type: 'serial', key: 'PK' },
      { name: 'name', type: 'varchar(255)', key: 'UNIQUE' },
      { name: 'description', type: 'text', nullable: true },
      { name: 'drift_level', type: "varchar(50)", note: 'none | low | moderate | high' },
      { name: 'status', type: "varchar(50)", note: 'pending | running | completed | failed' },
      { name: 'config', type: 'jsonb' },
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'finished_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'model_versions',
    label: 'Versões do modelo',
    description: 'Artefatos XGBoost treinados, hiperparâmetros e métricas de treino.',
    rows: '3',
    columns: [
      { name: 'id', type: 'serial', key: 'PK' },
      { name: 'experiment_id', type: 'integer', key: 'FK' },
      { name: 'version', type: 'varchar(50)', key: 'UNIQUE' },
      { name: 'model_path', type: 'varchar(500)' },
      { name: 'model_type', type: 'varchar(100)', note: 'XGBoost' },
      { name: 'hyperparameters', type: 'jsonb' },
      { name: 'training_metrics', type: 'jsonb' },
      { name: 'trained_at', type: 'timestamptz' },
      { name: 'is_active', type: 'boolean' },
    ],
  },
  {
    name: 'transactions',
    label: 'Transações',
    description: 'Base PaySim processada (step, tipo, valores e saldos).',
    rows: '6.362.620',
    columns: [
      { name: 'id', type: 'bigserial', key: 'PK' },
      { name: 'step', type: 'integer', note: '1 step = 1 hora' },
      { name: 'type', type: 'varchar(50)', note: 'PAYMENT, TRANSFER, CASH_OUT…' },
      { name: 'amount', type: 'numeric(15,2)' },
      { name: 'old_balance_org', type: 'numeric(15,2)', nullable: true },
      { name: 'new_balance_org', type: 'numeric(15,2)', nullable: true },
      { name: 'old_balance_dest', type: 'numeric(15,2)', nullable: true },
      { name: 'new_balance_dest', type: 'numeric(15,2)', nullable: true },
      { name: 'is_fraud', type: 'boolean' },
      { name: 'is_flagged_fraud', type: 'boolean' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'predictions',
    label: 'Predições',
    description: 'Log de scoring com probabilidade, versão do modelo e latência.',
    rows: '1.284.902',
    columns: [
      { name: 'id', type: 'bigserial', key: 'PK' },
      { name: 'model_version_id', type: 'integer', key: 'FK' },
      { name: 'transaction_id', type: 'bigint', key: 'FK' },
      { name: 'is_fraud', type: 'boolean' },
      { name: 'probability', type: 'numeric(6,5)' },
      { name: 'predicted_at', type: 'timestamptz' },
      { name: 'latency_ms', type: 'numeric(10,2)', nullable: true },
    ],
  },
  {
    name: 'performance',
    label: 'Performance',
    description: 'Métricas de desempenho agregadas por janela temporal.',
    rows: '96',
    columns: [
      { name: 'id', type: 'serial', key: 'PK' },
      { name: 'model_version_id', type: 'integer', key: 'FK' },
      { name: 'window_start', type: 'timestamptz' },
      { name: 'window_end', type: 'timestamptz' },
      { name: 'accuracy', type: 'numeric(6,5)', nullable: true },
      { name: 'precision', type: 'numeric(6,5)', nullable: true },
      { name: 'recall', type: 'numeric(6,5)', nullable: true },
      { name: 'f1_score', type: 'numeric(6,5)', nullable: true },
      { name: 'auc_roc', type: 'numeric(6,5)', nullable: true },
      { name: 'total_predictions', type: 'integer' },
      { name: 'true_positives', type: 'integer' },
      { name: 'false_positives', type: 'integer' },
      { name: 'true_negatives', type: 'integer' },
      { name: 'false_negatives', type: 'integer' },
    ],
  },
  {
    name: 'drift_metrics',
    label: 'Métricas de drift',
    description: 'PSI, KS, JS e Wasserstein por feature e janela.',
    rows: '576',
    columns: [
      { name: 'id', type: 'bigserial', key: 'PK' },
      { name: 'experiment_id', type: 'integer', key: 'FK' },
      { name: 'window_start', type: 'timestamptz' },
      { name: 'window_end', type: 'timestamptz' },
      { name: 'feature_name', type: 'varchar(255)' },
      { name: 'psi_value', type: 'numeric(18,6)', nullable: true },
      { name: 'ks_value', type: 'numeric(10,6)', nullable: true },
      { name: 'ks_pvalue', type: 'numeric(10,6)', nullable: true },
      { name: 'js_value', type: 'numeric(10,6)', nullable: true },
      { name: 'wasserstein_value', type: 'numeric(24,6)', nullable: true },
      { name: 'threshold', type: 'numeric(10,6)' },
      { name: 'is_drift', type: 'boolean' },
    ],
  },
  {
    name: 'alerts',
    label: 'Alertas',
    description: 'Eventos de drift, degradação e retreinamento com cooldown.',
    rows: '27',
    columns: [
      { name: 'id', type: 'bigserial', key: 'PK' },
      { name: 'experiment_id', type: 'integer', key: 'FK', nullable: true },
      { name: 'model_version_id', type: 'integer', key: 'FK', nullable: true },
      { name: 'alert_type', type: 'varchar(50)', note: 'drift_detected | performance_degradation | retrain_*' },
      { name: 'severity', type: 'varchar(20)', note: 'info | warning | critical' },
      { name: 'message', type: 'text' },
      { name: 'metadata', type: 'jsonb' },
      { name: 'triggered_at', type: 'timestamptz' },
      { name: 'is_resolved', type: 'boolean' },
      { name: 'resolved_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    name: 'feature_stats',
    label: 'Estatísticas de features',
    description: 'Resumo descritivo por feature/janela para inspeção e EDA.',
    rows: '288',
    columns: [
      { name: 'id', type: 'bigserial', key: 'PK' },
      { name: 'experiment_id', type: 'integer', key: 'FK' },
      { name: 'window_start', type: 'timestamptz' },
      { name: 'window_end', type: 'timestamptz' },
      { name: 'feature_name', type: 'varchar(255)' },
      { name: 'mean', type: 'numeric(15,6)', nullable: true },
      { name: 'std', type: 'numeric(15,6)', nullable: true },
      { name: 'min', type: 'numeric(15,6)', nullable: true },
      { name: 'max', type: 'numeric(15,6)', nullable: true },
      { name: 'median', type: 'numeric(15,6)', nullable: true },
      { name: 'q25', type: 'numeric(15,6)', nullable: true },
      { name: 'q75', type: 'numeric(15,6)', nullable: true },
      { name: 'count', type: 'integer' },
    ],
  },
];

export interface ServiceDefinition {
  name: string;
  container: string;
  image: string;
  port: string;
  description: string;
  dependsOn?: string;
  healthcheck?: string;
  optional?: boolean;
}

export const DOCKER_SERVICES: ServiceDefinition[] = [
  {
    name: 'PostgreSQL',
    container: 'drift-monitor-db',
    image: 'postgres:15-alpine',
    port: '5432',
    description: 'Banco transacional com schema inicial aplicado via entrypoint.',
    healthcheck: 'pg_isready -U admin -d drift_monitor',
  },
  {
    name: 'Backend',
    container: 'drift-monitor-backend',
    image: 'build ./backend',
    port: '8000',
    description: 'FastAPI + Uvicorn, monta o código e os modelos treinados.',
    dependsOn: 'db (service_healthy)',
    healthcheck: 'GET /health',
  },
  {
    name: 'Frontend',
    container: 'drift-monitor-frontend',
    image: 'build ./frontend',
    port: '3000',
    description: 'Next.js 14 com build standalone e hot reload de src/.',
    dependsOn: 'backend',
  },
  {
    name: 'PgAdmin',
    container: 'drift-monitor-pgadmin',
    image: 'dpage/pgadmin4:latest',
    port: '5050',
    description: 'Inspeção visual do banco (profile opcional "tools").',
    dependsOn: 'db',
    optional: true,
  },
];

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  group: string;
  description: string;
  testable?: 'health' | 'thresholds' | 'experiments' | 'summary';
}

export const API_ENDPOINTS: EndpointDefinition[] = [
  { method: 'GET', path: '/health', group: 'Health', description: 'Status da API, banco e modelo carregado.', testable: 'health' },
  { method: 'GET', path: '/api/v1/experiments/', group: 'Experimentos', description: 'Lista paginada com filtros de status, drift e busca.', testable: 'experiments' },
  { method: 'POST', path: '/api/v1/experiments/', group: 'Experimentos', description: 'Cria um novo experimento científico (E1–E4).' },
  { method: 'GET', path: '/api/v1/experiments/{id}', group: 'Experimentos', description: 'Detalhe e configuração de um experimento.' },
  { method: 'PATCH', path: '/api/v1/experiments/{id}', group: 'Experimentos', description: 'Atualização parcial de nome, descrição, status ou config.' },
  { method: 'POST', path: '/api/v1/experiments/{id}/start', group: 'Experimentos', description: 'Marca o experimento como em execução.' },
  { method: 'POST', path: '/api/v1/experiments/{id}/complete', group: 'Experimentos', description: 'Marca o experimento como concluído.' },
  { method: 'DELETE', path: '/api/v1/experiments/{id}', group: 'Experimentos', description: 'Remove o experimento e os dados em cascata.' },
  { method: 'POST', path: '/api/v1/predict/', group: 'Predição', description: 'Scoring de uma transação com o modelo ativo.' },
  { method: 'POST', path: '/api/v1/predict/batch', group: 'Predição', description: 'Scoring em lote com latência agregada.' },
  { method: 'GET', path: '/api/v1/predict/health', group: 'Predição', description: 'Status do preditor e caminho do artefato.' },
  { method: 'POST', path: '/api/v1/drift/detect', group: 'Drift', description: 'Detecta drift entre janelas persistidas e grava métricas.' },
  { method: 'POST', path: '/api/v1/drift/detect/feature', group: 'Drift', description: 'Detecta drift a partir de duas listas de valores (sem banco).' },
  { method: 'POST', path: '/api/v1/drift/detect/batch', group: 'Drift', description: 'Detecção em lote para várias features.' },
  { method: 'GET', path: '/api/v1/drift/metrics/{experiment_id}', group: 'Drift', description: 'Métricas de drift persistidas, com filtros.' },
  { method: 'GET', path: '/api/v1/drift/metrics/{experiment_id}/summary', group: 'Drift', description: 'Resumo agregado (máximos e features com drift).', testable: 'summary' },
  { method: 'GET', path: '/api/v1/drift/thresholds', group: 'Drift', description: 'Limiares padrão de PSI, KS, JS e Wasserstein.', testable: 'thresholds' },
  { method: 'GET', path: '/api/v1/drift/alerts/{experiment_id}', group: 'Drift', description: 'Alertas de drift ativos ou histórico completo.' },
  { method: 'PATCH', path: '/api/v1/drift/alerts/{alert_id}/resolve', group: 'Drift', description: 'Resolve ou reabre um alerta.' },
  { method: 'POST', path: '/api/v1/retrain/', group: 'Retreinamento', description: 'Dispara retreinamento em background e registra alerta.' },
  { method: 'GET', path: '/api/v1/retrain/history/{experiment_id}', group: 'Retreinamento', description: 'Histórico de retreinamentos do experimento.' },
  { method: 'GET', path: '/api/v1/metrics/performance/{model_version_id}', group: 'Métricas', description: 'Série de desempenho por janela de uma versão.' },
  { method: 'GET', path: '/api/v1/metrics/performance/summary/{experiment_id}', group: 'Métricas', description: 'Resumo de F1 por versão de modelo.' },
];

export const TEAM = [
  {
    name: 'Felipe Cunha Siqueira',
    role: 'ML & Dados',
    person: 'Pessoa 1',
    color: 'brand',
    tasks: 'EDA, features, XGBoost, simulador temporal, cenários de drift, retreino.',
  },
  {
    name: 'Gabriel dos Santos Ribeiro',
    role: 'Drift & Estatística',
    person: 'Pessoa 2',
    color: 'info',
    tasks: 'PSI, KS, JS, Wasserstein, limiares, alertas, E3 e análise estatística.',
  },
  {
    name: 'Gustavo Henrique Barbosa da Silva',
    role: 'Software & Fullstack',
    person: 'Pessoa 3',
    color: 'warn',
    tasks: 'API FastAPI, PostgreSQL, dashboard Next.js, gráficos, Docker e docs.',
  },
] as const;

export const DELIVERABLES = [
  { id: 'D1', label: 'Dataset processado e simulado', owner: 'Pessoa 1' },
  { id: 'D2', label: 'Modelo baseline treinado', owner: 'Pessoa 1' },
  { id: 'D3', label: 'Módulos de detecção de drift', owner: 'Pessoa 2' },
  { id: 'D4', label: 'API REST funcional', owner: 'Pessoa 3' },
  { id: 'D5', label: 'Dashboard interativo', owner: 'Pessoa 3' },
  { id: 'D6', label: 'Resultados dos 4 experimentos', owner: 'Todas' },
  { id: 'D7', label: 'Artigo científico', owner: 'Todas' },
  { id: 'D8', label: 'Documentação técnica', owner: 'Pessoa 3' },
  { id: 'D9', label: 'Repositório GitHub', owner: 'Todas' },
];

export const QUICK_COMMANDS = [
  { label: 'Subir a stack', command: 'docker compose up --build' },
  { label: 'Rodar a API local', command: 'cd backend && uvicorn api.main:app --reload' },
  { label: 'Rodar o frontend', command: 'cd frontend && npm install && npm run dev' },
  { label: 'Treinar baseline', command: 'cd backend && python -m ml.train' },
  { label: 'Experimento E3', command: 'cd backend && python -m experiments.e3_detection_methods' },
  { label: 'Testes', command: 'python -m pytest tests/ -v' },
];
