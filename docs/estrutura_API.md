# API REST — estrutura e referência

API FastAPI que expõe os módulos de ML, detecção de drift, experimentos e retreinamento.
Documentação interativa gerada automaticamente em **`/docs`** (Swagger) e **`/redoc`**.

- Base URL local: `http://localhost:8000`
- Prefixo versionado: `/api/v1`
- Formato: JSON (`Content-Type: application/json`)
- Sem autenticação nesta versão (ambiente experimental)

## Estrutura de arquivos

```
backend/
├── api/
│   ├── main.py                 # app, CORS, exception handlers, health
│   ├── dependencies.py         # sessão de banco, paginação, preditor, modelo ativo
│   ├── exceptions.py           # DriftMonitorException + subclasses (400/404/409/422/503)
│   ├── middleware/
│   │   ├── logging.py          # log de método, path, status e duração
│   │   └── timing.py           # header X-Process-Time
│   ├── routes/
│   │   ├── predict.py          # scoring único e em lote
│   │   ├── drift.py            # detecção, métricas, limiares e alertas
│   │   ├── retrain.py          # disparo e histórico de retreinamento
│   │   ├── metrics.py          # séries e resumo de desempenho
│   │   ├── experiments.py      # CRUD + transições de status
│   │   └── models.py           # versões de modelo e modelo ativo
│   └── schemas/                # contratos Pydantic v2
│       ├── common.py           # DeleteResponse, mensagens
│       ├── transaction.py
│       ├── prediction.py
│       ├── drift.py
│       ├── performance.py
│       ├── experiment.py
│       └── model.py
├── alembic.ini
├── entrypoint.sh               # espera o banco → migrations → seed → uvicorn
└── Dockerfile
```

## Endpoints

### Health

| Método | Endpoint | Resposta |
| ------ | -------- | -------- |
| GET | `/` | `{ service, version, status, model_loaded }` |
| GET | `/ping` | `{ message: "pong", service, version }` |
| GET | `/health` | `{ status, timestamp, components: { database, api, model, predictor }, version }` |

`/ping` é um liveness probe que **não** consulta o banco — útil para orquestradores.
`/health` retorna `degraded` quando o PostgreSQL está inacessível e indica o modo do preditor
(`model`, `mock` ou `not_loaded`).

Com `DEBUG=true` a API **sobe mesmo sem banco** (modo degradado): `/ping`, `/health`, os limiares
de drift e `/api/v1/drift/detect/feature` continuam respondendo; os endpoints que persistem dados
retornam `503 DatabaseUnavailable` com o mesmo envelope de erro. Com `DEBUG=false` o startup falha
imediatamente (fail-fast).

### Experimentos

| Método | Endpoint | Código | Descrição |
| ------ | -------- | ------ | --------- |
| POST | `/api/v1/experiments/` | 201 | Cria experimento (409 se o nome existir) |
| GET | `/api/v1/experiments/` | 200 | Lista com `status`, `drift_level`, `search`, `skip`, `limit` |
| GET | `/api/v1/experiments/{id}` | 200 | Detalhe (404 se não existir) |
| PATCH | `/api/v1/experiments/{id}` | 200 | Atualização parcial |
| DELETE | `/api/v1/experiments/{id}` | 200 | Remove em cascata |
| POST | `/api/v1/experiments/{id}/start` | 200 | `status = running`, grava `started_at` |
| POST | `/api/v1/experiments/{id}/complete` | 200 | `status = completed`, grava `finished_at` |

Envelope de listagem:

```json
{ "items": [], "total": 0, "skip": 0, "limit": 100, "has_next": false, "has_prev": false }
```

### Predição

| Método | Endpoint | Código | Descrição |
| ------ | -------- | ------ | --------- |
| POST | `/api/v1/predict/` | 201 | Scoring de uma transação |
| POST | `/api/v1/predict/batch` | 201 | Scoring em lote |
| GET | `/api/v1/predict/health` | 200 | `{ status, mode, model_path }` |

Sem artefato treinado e com `ALLOW_MOCK_PREDICTIONS=true`, o scoring usa um preditor heurístico
determinístico (`mode: "mock"`) e a predição não é persistida — a tabela `predictions` exige
`model_version_id`.

### Drift

| Método | Endpoint | Código | Descrição |
| ------ | -------- | ------ | --------- |
| POST | `/api/v1/drift/detect` | 200 | Detecta entre janelas persistidas, grava métricas e alertas |
| POST | `/api/v1/drift/detect/feature` | 200 | Detecta a partir de duas listas de valores (sem banco) |
| POST | `/api/v1/drift/detect/batch` | 200 | Várias features em uma chamada |
| GET | `/api/v1/drift/metrics/{experiment_id}` | 200 | Métricas com `feature`, `only_drift`, `skip`, `limit` |
| GET | `/api/v1/drift/metrics/{experiment_id}/summary` | 200 | Máximos por método e features em drift |
| GET | `/api/v1/drift/thresholds` | 200 | Limiares padrão (PSI, KS, JS, Wasserstein) |
| GET | `/api/v1/drift/alerts/{experiment_id}` | 200 | Alertas (`include_resolved`) |
| PATCH | `/api/v1/drift/alerts/{alert_id}/resolve` | 200 | `{ resolved: bool }` |

Resposta da detecção sem banco:

```json
{
  "feature_name": "amount",
  "psi": 0.83,
  "ks_stat": 0.91,
  "ks_pvalue": 0.0001,
  "js": 0.42,
  "wasserstein": 1210.4,
  "wasserstein_normalized": 0.87,
  "severity": "critical",
  "is_drift": true,
  "drift_score": 3.32,
  "methods": { "psi": { "...": "..." }, "ks": {}, "js": {}, "wasserstein": {} },
  "warnings": []
}
```

### Retreinamento

| Método | Endpoint | Código | Descrição |
| ------ | -------- | ------ | --------- |
| POST | `/api/v1/retrain/` | 202 | `{ experiment_id, reason, triggered_by }`, executa em background |
| GET | `/api/v1/retrain/history/{experiment_id}` | 200 | Alertas `retrain_triggered` / `retrain_completed` |

### Métricas e modelos

| Método | Endpoint | Descrição |
| ------ | -------- | --------- |
| GET | `/api/v1/metrics/performance/{model_version_id}` | Série por janela (accuracy, precision, recall, F1, AUC) |
| GET | `/api/v1/metrics/performance/summary/{experiment_id}` | `versions`, `best_f1`, `worst_f1`, `degradation` |
| GET | `/api/v1/models/{experiment_id}` | Versões treinadas + modelo ativo |
| GET | `/api/v1/models/{experiment_id}/active` | Metadados do modelo ativo |

## Erros

Formato único:

```json
{
  "error": "NotFoundException",
  "message": "Experiment com id '99' não encontrado",
  "detail": null,
  "path": "http://localhost:8000/api/v1/experiments/99"
}
```

| Código | Uso |
| ------ | --- |
| 400 | payload de drift inválido (valores/limiares) |
| 404 | experimento, alerta ou modelo inexistente |
| 409 | nome de experimento duplicado |
| 422 | validação Pydantic (campos e faixas) |
| 500 | falha ao persistir métricas / erro interno |
| 503 | banco indisponível (`DatabaseUnavailable`) ou modelo não carregado com mock desabilitado |

## CORS e headers

- Origens configuráveis por `CORS_ORIGINS` (padrão `http://localhost:3000,http://127.0.0.1:3000`).
- `X-Process-Time` exposto ao cliente (middleware de timing).
- Requisições logadas com método, path, status e duração.

## Rodando a API

```bash
# container (migrations + seed automáticos)
docker-compose up --build backend

# local
cd backend
alembic upgrade head
uvicorn api.main:app --reload
```

Variáveis relevantes: `DATABASE_URL`, `DEBUG`, `ALLOW_MOCK_PREDICTIONS`, `CORS_ORIGINS`,
`RUN_MIGRATIONS`, `SEED_DATABASE`. Lista completa no [README](../README.md#variáveis-de-ambiente).
