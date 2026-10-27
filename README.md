# Data Drift Fraud Monitor

Plataforma experimental que simula o ambiente de uma fintech para investigar o impacto do
**Data Drift** no desempenho de modelos de detecção de fraude e a eficácia de estratégias de
mitigação (retreinamento orientado por alertas).

O sistema integra cinco blocos: modelo de ML (XGBoost + PaySim), simulador temporal de drift,
detecção estatística de drift (PSI, KS, Jensen-Shannon e Wasserstein), dashboard de monitoramento
e mecanismo de retreinamento.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [API REST](#api-rest)
- [Experimentos científicos](#experimentos-científicos)
- [Frontend](#frontend)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Equipe](#equipe)
- [Entregáveis](#entregáveis)

---

## Arquitetura

```mermaid
flowchart TB
    subgraph FE["Frontend · Next.js 14 + Recharts"]
        D1["Dashboard"]
        D2["Drift & Estatística"]
        D3["Modelo & Dados"]
        D4["Experimentos"]
        D5["Sistema & Configurações"]
    end

    subgraph API["API REST · FastAPI"]
        R1["/api/v1/predict"]
        R2["/api/v1/drift"]
        R3["/api/v1/retrain"]
        R4["/api/v1/metrics"]
        R5["/api/v1/experiments"]
        R6["/api/v1/models"]
    end

    subgraph CORE["Módulos internos"]
        ML["ML · XGBoost<br/>treino · predição · métricas"]
        DR["Drift Detection<br/>PSI · KS · JS · Wasserstein"]
        SIM["Simulador temporal<br/>+ cenários de drift"]
        AL["Sistema de alertas<br/>limiares · severidade"]
    end

    DB[("PostgreSQL 15<br/>8 tabelas")]

    FE -->|HTTP/JSON| API
    API --> CORE
    API --> DB
    ML --> DB
    DR --> DB
    AL --> DB
```

Fluxo do experimento: o simulador gera janelas de transações com níveis crescentes de drift → o
modelo pontua cada janela → o detector calcula PSI/KS/JS/Wasserstein → os limiares disparam alertas
→ o retreinamento é acionado e o dashboard acompanha a recuperação do F1.

## Stack

| Camada        | Tecnologia                                   |
| ------------- | -------------------------------------------- |
| Linguagem     | Python 3.11+, TypeScript 5.3                 |
| ML            | XGBoost, Scikit-learn, Pandas, NumPy         |
| Estatística   | SciPy + implementações próprias              |
| API           | FastAPI 0.104, Pydantic 2, Uvicorn           |
| Banco         | PostgreSQL 15, SQLAlchemy 2, Alembic         |
| Frontend      | Next.js 14 (Pages Router), React 18, Recharts|
| Estilo        | Tailwind CSS 3 com design tokens (tema claro/escuro) |
| Infra         | Docker + Docker Compose                      |
| Documentação  | Markdown + Swagger/ReDoc                     |

## Como executar

### Pré-requisitos

- Docker e Docker Compose **ou** Python 3.11+ / Node.js 18+ para execução local
- (Opcional) dataset PaySim em `data/paysim.csv`

### Com Docker (recomendado)

```bash
cp .env.example .env
docker-compose up --build
```

| Serviço  | URL                            |
| -------- | ------------------------------ |
| Frontend | http://localhost:3000          |
| API      | http://localhost:8000          |
| Swagger  | http://localhost:8000/docs     |
| ReDoc    | http://localhost:8000/redoc    |
| PgAdmin  | http://localhost:5050 (`--profile tools`) |

Na primeira subida o backend aguarda o PostgreSQL, aplica as migrations (`alembic upgrade head`) e
insere os experimentos de demonstração (E1–E4).

### Sem Docker

```bash
# 1. Banco
docker-compose up -d db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://admin:admin123@localhost:5432/drift_monitor
alembic upgrade head
python -m db.init_db
uvicorn api.main:app --reload

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

> A API sobe mesmo sem modelo treinado: nesse caso as predições usam um preditor heurístico
> determinístico (`ALLOW_MOCK_PREDICTIONS=true`), sinalizado em `GET /api/v1/predict/health`.
> Com `DEBUG=true` ela também sobe sem PostgreSQL, em modo degradado (`GET /health` →
> `degraded`): os endpoints sem persistência continuam funcionando e os demais respondem
> `503 DatabaseUnavailable`. O dashboard também funciona offline, com dados de demonstração.

## Variáveis de ambiente

| Variável                 | Padrão                                   | Descrição                                              |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`           | `postgresql://admin:admin123@db:5432/drift_monitor` | Conexão usada pela API e pelo Alembic       |
| `DEBUG`                  | `true`                                   | Log detalhado e criação automática de tabelas          |
| `API_HOST` / `API_PORT`  | `0.0.0.0` / `8000`                       | Bind do Uvicorn                                        |
| `CORS_ORIGINS`           | `http://localhost:3000,...`              | Origens permitidas (lista separada por vírgulas)       |
| `ALLOW_MOCK_PREDICTIONS` | `true`                                   | Preditor heurístico quando não há artefato treinado     |
| `RUN_MIGRATIONS`         | `true`                                   | Executa `alembic upgrade head` no entrypoint           |
| `SEED_DATABASE`          | `true`                                   | Insere E1–E4 na primeira subida                        |
| `BACKEND_RELOAD`         | `true`                                   | Hot-reload do Uvicorn (desligue em produção)           |
| `PSI_THRESHOLD`          | `0.25`                                   | Limiar crítico de PSI                                  |
| `KS_PVALUE_THRESHOLD`    | `0.05`                                   | p-valor crítico do KS                                  |
| `JS_THRESHOLD`           | `0.1`                                    | Limiar crítico de Jensen-Shannon                       |
| `WASSERSTEIN_THRESHOLD`  | `0.1`                                    | Limiar crítico da Wasserstein (normalizada)            |
| `MODEL_PATH`             | `/app/models`                            | Diretório dos artefatos `.joblib`                      |
| `DATASET_PATH`           | `/app/data/paysim.csv`                   | Caminho do PaySim                                      |
| `NEXT_PUBLIC_API_URL`    | `http://localhost:8000`                  | URL da API usada pelo frontend (build-time)            |

## Banco de dados e migrations

Modelo relacional completo em [`docs/modelagem_banco.md`](docs/modelagem_banco.md):
`experiments`, `model_versions`, `transactions`, `predictions`, `performance`,
`drift_metrics`, `alerts` e `feature_stats`.

```bash
cd backend

alembic upgrade head              # aplica todas as migrations
alembic current                   # versão aplicada
alembic upgrade head --sql        # apenas imprime o SQL (revisão sem banco)
alembic revision --autogenerate -m "descrição"   # nova migration a partir dos modelos
alembic downgrade -1              # desfaz a última
```

O `backend/db/schema.sql` é usado pelo Postgres na primeira inicialização do container
(`docker-entrypoint-initdb.d`). Ele e a migration inicial são convergentes: `alembic upgrade head`
usa `checkfirst=True`, portanto é seguro rodar sobre um banco já criado pelo `schema.sql`.

Para inspecionar o banco:

```bash
docker-compose exec db psql -U admin -d drift_monitor -c "\dt"
```

## API REST

Documentação interativa em `/docs` (Swagger) e `/redoc`. Todos os erros seguem o formato
`{ "error", "message", "detail" }`; listagens usam `skip`/`limit`.

### Health

| Método | Endpoint  | Descrição                                        |
| ------ | --------- | ------------------------------------------------ |
| GET    | `/`       | Identificação do serviço                         |
| GET    | `/ping`   | Liveness probe leve (não consulta o banco)       |
| GET    | `/health` | Readiness: banco, API e modo do preditor         |

### Experimentos

| Método | Endpoint                          | Descrição                              |
| ------ | --------------------------------- | -------------------------------------- |
| POST   | `/api/v1/experiments/`            | Cria experimento (nome único)          |
| GET    | `/api/v1/experiments/`            | Lista com filtros e paginação          |
| GET    | `/api/v1/experiments/{id}`        | Detalhe                                |
| PATCH  | `/api/v1/experiments/{id}`        | Atualização parcial                    |
| DELETE | `/api/v1/experiments/{id}`        | Remove em cascata                      |
| POST   | `/api/v1/experiments/{id}/start`  | Marca como `running`                   |
| POST   | `/api/v1/experiments/{id}/complete` | Marca como `completed`               |

### Predição

| Método | Endpoint                    | Descrição                                        |
| ------ | --------------------------- | ------------------------------------------------ |
| POST   | `/api/v1/predict/`          | Scoring de uma transação                         |
| POST   | `/api/v1/predict/batch`     | Scoring em lote                                  |
| GET    | `/api/v1/predict/health`    | Status do preditor e modo (`model` ou `mock`)    |

### Drift

| Método | Endpoint                                       | Descrição                                     |
| ------ | ---------------------------------------------- | --------------------------------------------- |
| POST   | `/api/v1/drift/detect`                         | Detecta drift entre janelas persistidas       |
| POST   | `/api/v1/drift/detect/feature`                 | Detecta drift em valores brutos (sem banco)   |
| POST   | `/api/v1/drift/detect/batch`                   | Detecção em lote                              |
| GET    | `/api/v1/drift/metrics/{experiment_id}`        | Métricas persistidas (filtros)                |
| GET    | `/api/v1/drift/metrics/{experiment_id}/summary`| Máximos e features em drift                   |
| GET    | `/api/v1/drift/thresholds`                     | Limiares padrão                               |
| GET    | `/api/v1/drift/alerts/{experiment_id}`         | Alertas ativos ou histórico                   |
| PATCH  | `/api/v1/drift/alerts/{alert_id}/resolve`      | Resolve/reabre um alerta                      |

### Retreinamento, métricas e modelos

| Método | Endpoint                                            | Descrição                                   |
| ------ | --------------------------------------------------- | ------------------------------------------- |
| POST   | `/api/v1/retrain/`                                  | Dispara retreinamento (202, background)     |
| GET    | `/api/v1/retrain/history/{experiment_id}`           | Histórico de retreinamentos                 |
| GET    | `/api/v1/metrics/performance/{model_version_id}`    | Série de desempenho por janela              |
| GET    | `/api/v1/metrics/performance/summary/{experiment_id}` | Resumo de F1 por versão                   |
| GET    | `/api/v1/models/{experiment_id}`                    | Versões de modelo + ativa                   |
| GET    | `/api/v1/models/{experiment_id}/active`             | Metadados do modelo ativo                   |

Exemplo:

```bash
curl -X POST http://localhost:8000/api/v1/drift/detect/feature \
  -H "Content-Type: application/json" \
  -d '{
    "feature_name": "amount",
    "reference": [10, 12, 11, 13, 12, 15, 14, 11, 12, 13, 16, 12],
    "current": [120, 135, 128, 150, 142, 160, 155, 138, 149, 152, 171, 144]
  }'
```

## Experimentos científicos

| ID | Objetivo                                          | Responsável      | Métricas principais                          |
| -- | ------------------------------------------------- | ---------------- | -------------------------------------------- |
| E1 | Desempenho sem Data Drift (controle)              | Pessoa 1         | Accuracy, Precision, Recall, F1, AUC-ROC     |
| E2 | Inserir níveis de drift (baixo/moderado/forte)    | Pessoa 1         | Mesmas métricas + comparação temporal        |
| E3 | Comparar métodos de detecção                      | Pessoa 2         | Sensibilidade, especificidade, latência      |
| E4 | Avaliar se o retreinamento recupera desempenho    | Pessoa 1 + 2     | Recuperação de F1, tempo de recuperação      |

Resultados do E3 em [`backend/experiments/results/e3/e3_results.json`](backend/experiments/results/e3/e3_results.json)
e relatório em [`docs/relatorio_E3.md`](docs/relatorio_E3.md).

## Frontend

Detalhes em [`frontend/README.md`](frontend/README.md). Rotas:

| Rota             | Alias          | Frente | Conteúdo                                             |
| ---------------- | -------------- | ------ | ---------------------------------------------------- |
| `/`              | —              | P3     | KPIs, performance, drift, alertas, pipeline E1–E4     |
| `/drift`         | —              | P2     | PSI/KS/JS/Wasserstein, limiares, alertas, E3, sandbox |
| `/modelo`        | —              | P1     | Modelo, dataset, simulador, retreinamento             |
| `/experimentos`  | `/experiments` | E1–E4  | Ciclo de vida dos experimentos                       |
| `/sistema`       | —              | P3     | Saúde da API, Docker, endpoints, schema              |
| `/configuracoes` | `/settings`    | P3     | Conexão, tema, limiares padrão                       |

O dashboard consome a API quando disponível e cai automaticamente para uma base determinística
quando ela está offline — o selo `Demo`/`Online` no topo indica a origem dos dados.

## Testes

```bash
# Backend (na raiz; requer backend/ no path, tratado pelo conftest)
pytest -q

# Apenas testes que não precisam de banco
pytest -q -m "not db"

# Frontend
cd frontend
npm run typecheck
npm run build
```

Testes marcados com `db` são pulados automaticamente quando o PostgreSQL do projeto não está
acessível; com `docker-compose up -d db` eles rodam por completo.

## Estrutura do projeto

```
data-drift-fraud-monitor/
├── backend/
│   ├── api/
│   │   ├── main.py              # FastAPI, CORS, handlers, health
│   │   ├── dependencies.py      # sessão, paginação, preditor
│   │   ├── exceptions.py
│   │   ├── middleware/          # logging e timing
│   │   ├── routes/              # predict, drift, retrain, metrics, experiments, models
│   │   └── schemas/             # contratos Pydantic
│   ├── ml/                      # modelo, treino, predição (real + mock), métricas
│   ├── drift/                   # psi, ks_test, js_divergence, wasserstein, detector, alertas
│   ├── data/                    # loader, preprocess, simuladores
│   ├── db/
│   │   ├── models.py            # 8 tabelas SQLAlchemy
│   │   ├── schema.sql           # DDL para init do container
│   │   ├── migrations/          # Alembic (env + versions)
│   │   └── init_db.py           # seed E1–E4
│   ├── experiments/             # e1–e4 + análise estatística
│   ├── alembic.ini
│   ├── entrypoint.sh            # espera banco → migrations → seed → uvicorn
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/          # Dashboard, MetricsChart, DriftChart, AlertPanel, FeatureDrift…
│   │   ├── pages/                # index, drift, modelo, experimentos, sistema, configuracoes
│   │   ├── hooks/ context/ data/ lib/ services/ styles/ types/
│   ├── Dockerfile
│   └── README.md
├── docs/                        # arquitetura, banco, API, métodos, E3
├── notebooks/                   # EDA, baseline, simulação, análise
├── tests/                       # pytest (API, drift, E3, estatística)
├── scripts/                     # Makefile e setup
├── docker-compose.yml
└── README.md
```

## Equipe

| Nome                                    | Responsabilidade        |
| --------------------------------------- | ----------------------- |
| Felipe Cunha Siqueira                   | ML & Dados              |
| Gabriel dos Santos Ribeiro              | Drift & Estatística     |
| Gustavo Henrique Barbosa da Silva       | Software & Fullstack    |

## Entregáveis

| ID | Entregável                            | Status |
| -- | ------------------------------------- | ------ |
| D1 | Dataset processado e simulado          | P1     |
| D2 | Modelo baseline treinado               | P1     |
| D3 | Módulos de detecção de drift           | P2     |
| D4 | API REST funcional                     | ✅     |
| D5 | Dashboard interativo                   | ✅     |
| D6 | Resultados dos 4 experimentos          | E1–E3 ✅ · E4 em andamento |
| D7 | Artigo científico                      | —      |
| D8 | Documentação técnica                   | ✅     |
| D9 | Repositório GitHub                     | ✅     |

## Licença

Projeto acadêmico — uso educacional e de pesquisa.
