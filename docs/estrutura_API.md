3.1 Estrutura de Arquivos da API

backend/
├── api/
│   ├── __init__.py
│   ├── main.py                     # Aplicação FastAPI
│   ├── dependencies.py             # Dependências (DB session, etc.)
│   ├── exceptions.py               # Exceções customizadas
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── predict.py              # Endpoints de predição
│   │   ├── drift.py                # Endpoints de drift
│   │   ├── retrain.py              # Endpoints de retreinamento
│   │   ├── metrics.py              # Endpoints de métricas
│   │   └── experiments.py          # Endpoints de experimentos
│   └── schemas/
│       ├── __init__.py
│       ├── transaction.py          # Schemas de transação
│       ├── prediction.py           # Schemas de predição
│       ├── drift.py                # Schemas de drift
│       ├── performance.py          # Schemas de performance
│       └── experiment.py           # Schemas de experimento


4. ENDPOINTS DA API — RESUMO
Método	Endpoint	Descrição
POST	/api/v1/predict/	Predição única
POST	/api/v1/predict/batch	Predição em lote
POST	/api/v1/drift/detect	Detecção de drift em janelas persistidas
POST	/api/v1/drift/detect/feature	Detecção de drift em valores brutos (sem banco)
POST	/api/v1/drift/detect/batch	Detecção de drift em lote (sem banco)
GET	/api/v1/drift/metrics/{experiment_id}	Métricas de drift
GET	/api/v1/drift/metrics/{experiment_id}/summary	Resumo das métricas de drift
GET	/api/v1/drift/thresholds	Limiares padrão de drift
GET	/api/v1/drift/alerts/{experiment_id}	Alertas de drift
PATCH	/api/v1/drift/alerts/{alert_id}/resolve	Resolver/reabrir alerta
POST	/api/v1/retrain/	Disparar retreinamento
GET	/api/v1/retrain/history/{experiment_id}	Histórico de retreinamentos
GET	/api/v1/metrics/performance/{model_version_id}	Métricas de desempenho
GET	/api/v1/metrics/performance/summary/{experiment_id}	Resumo de desempenho
POST	/api/v1/experiments/	Criar experimento
GET	/api/v1/experiments/	Listar experimentos
GET	/api/v1/experiments/{id}	Obter experimento
PATCH	/api/v1/experiments/{id}	Atualizar experimento
DELETE	/api/v1/experiments/{id}	Remover experimento

5. STACK TECNOLÓGICA DA PESSOA 3
Camada	Tecnologia	Versão
Linguagem	Python	3.11+
Framework Web	FastAPI	0.104+
Servidor	Uvicorn	0.24+
ORM	SQLAlchemy	2.0+
Banco	PostgreSQL	15+
Migrations	Alembic	1.12+
Validação	Pydantic	2.5+
Container	Docker	-
Orquestração	Docker Compose	-