# Pipeline de ML e Dados (Pessoa 1)

Documento técnico do bloco de ML/dados: dataset, features, modelo baseline,
simuladores, experimentos e retreinamento orientado por alertas.

## 1. Estrutura

| Módulo | Responsabilidade |
| ------ | ---------------- |
| `backend/data/loader.py` | Carrega/normaliza o PaySim e gera amostra sintética determinística (T1.1) |
| `backend/data/preprocess.py` | Features, rótulos e split temporal (T1.2) |
| `backend/data/temporal_simulator.py` | Janelas temporais contíguas e ramp de drift (T1.4) |
| `backend/data/drift_simulator.py` | Cenários `none/low/moderate/high` (T1.5) |
| `backend/ml/model.py` | Wrapper XGBoost + artefato versionado |
| `backend/ml/train.py` | Treino/avaliação do baseline (T1.3) |
| `backend/ml/metrics.py` | Accuracy, Precision, Recall, F1, AUC-ROC, PR-AUC (T1.6) |
| `backend/ml/predict.py` | Inferência da API com o mesmo feature engineering |
| `backend/ml/retrain.py` | Retreino em memória e persistido (T1.7/T1.8) |
| `backend/experiments/e1_no_drift.py` | E1 — controle sem drift |
| `backend/experiments/e2_drift_levels.py` | E2 — degradação por cenário |
| `backend/experiments/e4_retraining.py` | E4 — eficácia do retreinamento |

## 2. Dataset (D1)

Colunas normalizadas:

```
step, type, amount, name_orig, old_balance_org, new_balance_org,
name_dest, old_balance_dest, new_balance_dest, is_fraud, is_flagged_fraud
```

`load_paysim()` procura o CSV em `DATASET_PATH`, `data/paysim.csv`,
`backend/data/paysim.csv` e `./data/paysim.csv`. Se nenhum existir, gera uma
amostra sintética determinística com o mesmo contrato:

- taxa de fraude padrão de **0,5%** (maior que a do PaySim real para dar poder
  estatístico às janelas);
- fraude apenas em `TRANSFER`/`CASH_OUT`;
- esvaziamento total ou parcial da conta de origem;
- 20% das fraudes usam destino com saldo prévio (mula não zerada);
- 1,5% das transferências legítimas também esvaziam a conta (falsos positivos
  plausíveis).

Para materializar o D1:

```bash
cd backend
python -m data.loader --rows 60000 --out ../data/paysim_sample.csv
```

## 3. Features (T1.2)

| Feature | Definição |
| ------- | --------- |
| `amount` | Valor da transação |
| `old_balance_org` | Saldo da origem antes |
| `new_balance_org` | Saldo da origem depois |
| `old_balance_dest` | Saldo do destino antes |
| `new_balance_dest` | Saldo do destino depois |
| `balance_diff_org` | `old_balance_org - new_balance_org` |
| `balance_diff_dest` | `new_balance_dest - old_balance_dest` |
| `amount_ratio` | `amount / (|old_balance_org| + 1)` |
| `type` | Mapa fixo `PAYMENT=0, TRANSFER=1, CASH_OUT=2, CASH_IN=3, DEBIT=4` |

O split é sempre **temporal** (`70%` treino / `30%` teste por padrão). O mapa de
tipos e a ordem das features fazem parte do artefato salvo; `prepare_inference_frame`
garante que a API aplique a mesma transformação do treino.

## 4. Modelo baseline (D2)

- Backend padrão: **XGBoost** (`n_estimators=300`, `max_depth=6`,
  `learning_rate=0.05`, `subsample=0.9`, `colsample_bytree=0.8`,
  `tree_method=hist`, `eval_metric=aucpr`).
- `scale_pos_weight` recalculado a cada treino (classe desbalanceada).
- Fallback automático para `HistGradientBoostingClassifier` quando o XGBoost não
  está instalado.
- Artefato `joblib` versionado:

```python
{
    "artifact_version": 1,
    "model": <estimador>,
    "model_type": "XGBoost",
    "features": [...],
    "type_codes": {...},
    "hyperparameters": {...},
    "decision_threshold": 0.5,
    "metrics": {...},
    "training_metrics": {...},
    "dataset": {...},
    "version": "v1.1.0-xgb",
    "trained_at": "2026-...",
}
```

Artefatos antigos (estimador puro salvo com `joblib`) continuam aceitos por
compatibilidade.

## 5. Cenários de drift (T1.4 / T1.5)

| Nível | Intensidade | Efeito |
| ----- | ----------- | ------ |
| `none` | 0,00 | Controle |
| `low` | 0,35 | Deslocamento leve de valores/saldos e ~2% de nova tipologia |
| `moderate` | 0,70 | Valores ~60% maiores, mix de tipos alterado e ~5% de nova tipologia |
| `high` | 1,20 | Valores ~2x, mix alterado e ~10% de nova tipologia |

Componentes:

1. **Covariate shift** — valores e saldos escalam; parte de `PAYMENT`/`CASH_IN`
   muda para `TRANSFER`/`CASH_OUT`.
2. **Concept drift** — surge uma tipologia de fraude que **preserva saldo na
   origem** e usa uma conta de destino recém-criada (saldo inicial zero) que
   recebe o valor; parte das fraudes antigas deixa de ser fraude (fraudadores
   se adaptam).

O `TemporalSimulator` divide o fluxo em janelas contíguas e aplica o drift com
intensidade constante (`generate`) ou crescente (`ramp=True`).

## 6. Experimentos (D6)

### E1 — sem drift

Treina o baseline na porção inicial e avalia em janelas do futuro imediato, sem
drift. Mede estabilidade (`F1` médio/desvio, variação primeira × última janela).

```bash
cd backend
python -m experiments.e1_no_drift --rows 60000 --windows 12
```

### E2 — cenários de drift

O mesmo baseline é avaliado nos quatro cenários. Para cada janela são calculados
PSI/KS contra a referência de treino (detector da Pessoa 2), além das métricas de
classificação. A degradação é reportada em relação ao controle `none`.

```bash
python -m experiments.e2_drift_levels --rows 60000 --windows 12
```

### E4 — retreinamento orientado por alertas

Compara duas políticas em um fluxo com drift crescente:

- **sem retreino** — baseline fixo;
- **retreino por alerta** — quando o detector sinaliza drift (ou PSI ≥ limite),
  as últimas `window_buffer` janelas rotuladas treinam uma nova versão, que entra
  em vigor na janela seguinte; há `cooldown` entre retreinos e o limiar é
  recalibrado na validação temporal.

```bash
python -m experiments.e4_retraining --rows 60000 --windows 12
```

Métricas de interesse: F1 médio por política, F1 nas últimas janelas, ganho de
F1, número de retreinos e janelas até recuperar 90% do F1 inicial.

### Saídas

```
backend/experiments/results/
├── e1/  e1_results.json  e1_windows.csv  e1_report.md
├── e2/  e2_results.json  e2_windows.csv  e2_summary.csv  e2_report.md
├── e3/  (Pessoa 2)
└── e4/  e4_results.json  e4_windows.csv  e4_retrains.csv  e4_report.md
```

## 7. Integração com a API (T1.8)

- `GET /health` indica `predictor: model|mock`.
- `POST /api/v1/predict/` e `/batch` usam `FraudPredictor` (artefato real) ou o
  fallback heurístico.
- `python -m ml.train --register --experiment-id 1` grava o baseline em
  `model_versions` e o promove a ativo, para que o startup da API o carregue.
- `POST /api/v1/retrain/` dispara `ModelRetrainer.retrain` em background:
  coleta dados, treina, grava `model_versions`/`performance`, registra
  `retrain_triggered`/`retrain_completed` e recarrega o modelo ativo.
- `GET /api/v1/retrain/versions/{experiment_id}` lista as versões e métricas.

## 8. Reprodutibilidade

- `--seed 42` em todos os geradores, splits, treinos e experimentos.
- Nenhum experimento depende de banco; a integração com banco é testada à parte.
- A suíte `pytest` cobre loader, features, simuladores, modelo, métricas,
  retreinamento e versões reduzidas de E1/E2/E4.
