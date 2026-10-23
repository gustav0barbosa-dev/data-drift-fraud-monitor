# Módulo de detecção de drift — documentação técnica (Pessoa 2)

Esta documentação cobre as entregas **T2.1 a T2.8** da Pessoa 2
(Detecção de Drift & Estatística):

| Tarefa | Entrega | Arquivo |
|---|---|---|
| T2.1 | Population Stability Index | `backend/drift/psi.py` |
| T2.2 | Teste Kolmogorov-Smirnov | `backend/drift/ks_test.py` |
| T2.3 | Divergência Jensen-Shannon | `backend/drift/js_divergence.py` |
| T2.4 | Distância de Wasserstein | `backend/drift/wasserstein.py` |
| T2.5 | Limiares e sistema de alertas | `backend/drift/thresholds.py`, `backend/drift/alert_system.py` |
| T2.6 | Comparação de sensibilidade (E3) | `backend/experiments/e3_detection_methods.py` |
| T2.7 | Integração com a API | `backend/api/routes/drift.py`, `backend/api/schemas/drift.py` |
| T2.8 | Análise estatística | `backend/experiments/statistical_analysis.py`, `docs/relatorio_E3.md` |

O detector agregador fica em `backend/drift/detector.py` e é o ponto de
entrada recomendado para API, experimentos e notebooks.

---

## 1. Métodos estatísticos

### 1.1 PSI — Population Stability Index

Mede a mudança entre a distribuição de referência $P$ e a atual $Q$:

$$
\mathrm{PSI} = \sum_{i=1}^{k} (q_i - p_i)\ln\left(\frac{q_i}{p_i}\right)
$$

Implementação:

- bins por **quantis da referência** (`numpy.percentile`);
- bordas externas abertas ($-\infty$, $+\infty$), garantindo que valores
  atuais fora do intervalo de referência sejam contabilizados;
- bins duplicados/constantes são tratados (referência constante gera três
  faixas ao redor do valor);
- `epsilon = 1e-6` com renormalização para evitar $\ln(0)$;
- variáveis categóricas usam `calculate_psi_categorical`, com a união das
  categorias das duas amostras.

Interpretação: `< 0,10` estável; `0,10–0,25` moderado; `>= 0,25`
significativo.

Funções: `calculate_psi`, `calculate_psi_categorical`, `interpret_psi`,
`psi_components`.

### 1.2 KS — Kolmogorov-Smirnov

Compara as ECDFs:

$$
D = \sup_x |F_{\text{ref}}(x) - F_{\text{atual}}(x)|
$$

`scipy.stats.ks_2samp` (bilateral, `method="auto"`) retorna `(D, p-valor)`.
Rejeita-se $H_0$ (mesma distribuição) quando `p < 0,05`. O p-valor é
sensível ao tamanho amostral; por isso a decisão final combina o KS com
métricas de magnitude.

Funções: `calculate_ks`, `calculate_ks_detailed`.

### 1.3 Jensen-Shannon

$$
JS(P\|Q) = \tfrac{1}{2}KL(P\|M) + \tfrac{1}{2}KL(Q\|M),\quad M = \tfrac{P+Q}{2}
$$

- `calculate_js` retorna a **distância** $\sqrt{JS}$ (0 a ~0,83), compatível
  com `scipy.spatial.distance.jensenshannon`;
- `calculate_js_divergence` retorna a **divergência** (com `base=2`, 0 a 1);
- `calculate_js_categorical` usa as frequências das categorias.

**Correção de viés:** o estimador plug-in de histograma tem viés positivo
com amostras finitas. O detector usa `bias_correction=True`, que subtrai a
divergência esperada sob $H_0$:

$$
\mathbb{E}[JS] \approx \frac{k-1}{4}\left(\frac{1}{n_1}+\frac{1}{n_2}\right)
$$

Isso mantém a taxa de falso positivo próxima do nominal mesmo com janelas
pequenas (~5% para KS; ~0% para JS/PSI/Wasserstein no E3).

### 1.4 Wasserstein

$$
W_1(P,Q) = \int |F_P(x)-F_Q(x)|\,dx
$$

O valor bruto tem a unidade da feature. Para decisão usa-se a versão
normalizada:

$$
W_{1,\text{norm}} = \frac{W_1}{\text{escala}(P)}
$$

com `escala = std(P)` (padrão) ou `IQR(P)`. Se a referência for
degenerada, usa-se a magnitude da média como fallback. Isso permite o
mesmo limiar para features com escalas diferentes.

Funções: `calculate_wasserstein`, `calculate_wasserstein_normalized`.

---

## 2. Limiares e classificação

`DriftThresholds` (`backend/drift/thresholds.py`) define:

| Método | Warning | Critical | Direção |
|---|---:|---:|---|
| PSI | 0,10 | 0,25 | `above` |
| KS (p-valor) | 0,10 | 0,05 | `below` |
| JS (distância) | 0,05 | 0,10 | `above` |
| Wasserstein normalizado | 0,10 | 0,25 | `above` |

Cada método é classificado como `none`, `warning` ou `critical`. O
resultado agregado usa a **maior severidade**; por padrão
(`trigger_severity="critical"`), só há drift confirmado quando ao menos um
método atinge o limiar crítico. Isso preserva o comportamento anterior da
API (PSI > 0,25, KS p < 0,05, JS > 0,10) e reduz alarmes por variação
natural.

Configuração parcial por requisição:

```json
{
  "thresholds": {
    "psi": {"warning": 0.1, "critical": 0.2},
    "ks": {"warning": 0.1, "critical": 0.01},
    "trigger_severity": "warning",
    "min_samples": 50
  }
}
```

Os limiares padrão também podem ser consultados em
`GET /api/v1/drift/thresholds`.

### Amostra mínima

`min_samples` (default 30) sinaliza `insufficient_data=True`. O resultado
continua reportando as métricas, mas `is_drift=False` e o sistema de
alertas ignora a feature. Isso evita alertas com janelas pequenas.

---

## 3. Detector agregado

```python
from drift import DriftDetector

detector = DriftDetector()
result = detector.detect(
    reference=df_train["amount"],
    current=df_prod["amount"],
    feature_name="amount",
)
```

Retorno (resumido):

```json
{
  "feature_name": "amount",
  "n_reference": 1000,
  "n_current": 500,
  "categorical": false,
  "insufficient_data": false,
  "severity": "critical",
  "is_drift": true,
  "drift_score": 0.82,
  "psi": 0.57,
  "ks_stat": 0.45,
  "ks_pvalue": 1.2e-31,
  "js": 0.30,
  "wasserstein": 1234.5,
  "wasserstein_normalized": 0.82,
  "methods": {
    "psi": {"available": true, "value": 0.57, "threshold": 0.25, "severity": "critical"},
    "ks": {"available": true, "value": 1.2e-31, "statistic": 0.45, "direction": "below"},
    "js": {"available": true, "value": 0.30},
    "wasserstein": {"available": true, "value": 0.82, "statistic": 1234.5}
  },
  "warnings": []
}
```

`detect_frame(reference_df, current_df)` processa várias features e retorna
`features`, `drifted_features`, `overall_drift`, `max_severity` e
`max_drift_score`. Features categóricas têm PSI/JS calculados e KS/
Wasserstein marcados como indisponíveis.

---

## 4. Sistema de alertas

`backend/drift/alert_system.py`:

- `build_drift_alerts` (puro) agrega features afetadas em **um alerta por
  janela**, com `critical_features`, `warning_features`, `per_feature`,
  janela e limiares;
- severidade do alerta = maior severidade entre as features;
- `AlertSystem.process` persiste o alerta, com **cooldown** (default 60
  min) e deduplicação: alertas repetidos são suprimidos, mas uma
  **escalada** de `warning` para `critical` sempre é criada;
- `resolve_alert` / `get_active_alerts` / `get_alert_history` dão suporte
  ao dashboard;
- `create_drift_alert` é mantido por compatibilidade;
- sem sessão de banco, a avaliação funciona e `process` retorna
  `persisted=False` (útil em notebooks e testes).

Alertas usam a tabela `alerts` (`alert_type='drift_detected'`), com
`metadata` JSON contendo features, scores e janela.

---

## 5. API REST

Endpoints implementados em `backend/api/routes/drift.py`:

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/drift/detect/feature` | Detecta drift em duas listas de valores (sem banco) |
| `POST` | `/api/v1/drift/detect/batch` | Detecta drift para várias features (sem banco) |
| `POST` | `/api/v1/drift/detect` | Detecta drift entre janelas persistidas e salva `drift_metrics` |
| `GET` | `/api/v1/drift/metrics/{experiment_id}` | Lista métricas (filtros `feature`, `only_drift`) |
| `GET` | `/api/v1/drift/metrics/{experiment_id}/summary` | Resumo agregado do experimento |
| `GET` | `/api/v1/drift/thresholds` | Limiares padrão |
| `GET` | `/api/v1/drift/alerts/{experiment_id}` | Alertas de drift |
| `PATCH` | `/api/v1/drift/alerts/{alert_id}/resolve` | Resolve/reabre alerta |

Exemplo sem banco:

```bash
curl -X POST http://localhost:8000/api/v1/drift/detect/feature \
  -H "Content-Type: application/json" \
  -d '{
    "feature_name": "amount",
    "reference": [10, 12, 11, 9, 10, 13, 12, 11],
    "current": [50, 55, 48, 60, 52, 51, 49, 58]
  }'
```

A resposta segue `FeatureDriftResponse`, com resultados por método e
severidade.

Detecção por janelas:

```bash
curl -X POST http://localhost:8000/api/v1/drift/detect \
  -H "Content-Type: application/json" \
  -d '{
    "experiment_id": 1,
    "reference_window_start": "2024-01-01T00:00:00Z",
    "reference_window_end": "2024-01-07T23:59:59Z",
    "current_window_start": "2024-01-08T00:00:00Z",
    "current_window_end": "2024-01-14T23:59:59Z",
    "methods": ["psi", "ks", "js", "wasserstein"]
  }'
```

As métricas são persistidas em `drift_metrics`; o alerta é criado apenas
se houver drift confirmado. O campo `threshold` armazena o limiar crítico
do PSI (0,25) por compatibilidade com o esquema existente.

> Observação: `wasserstein_value` na tabela foi ampliado para
> `NUMERIC(24,6)` porque o valor bruto pode ter a magnitude de valores
> monetários do PaySim. O valor normalizado é retornado pela API.

---

## 6. Experimento E3

`backend/experiments/e3_detection_methods.py` compara os quatro métodos em
cenários controlados:

| Cenário | Deslocamento | Escala |
|---|---:|---:|
| `none` | 0,0σ | 1,00 |
| `low` | 0,2σ | 1,05 |
| `moderate` | 0,5σ | 1,20 |
| `high` | 1,0σ | 1,50 |

Cada execução calcula:

- taxa de detecção (sensibilidade) e intervalo de Wilson;
- taxa de falso positivo no cenário `none` (1 − especificidade);
- AUC-ROC com IC bootstrap;
- latência: janelas até o primeiro alerta, com drift gradual e censura;
- McNemar, kappa de Cohen e diferença de acurácia entre pares.

Execução:

```bash
cd backend
python -m experiments.e3_detection_methods
# opções: --repetitions 500 --latency-repetitions 100 --seed 7
```

Saídas em `backend/experiments/results/e3/`:

- `e3_results.json`
- `e3_report.md`
- `e3_performance.csv`
- `e3_latency.csv`

O relatório consolidado também está em `docs/relatorio_E3.md`.

### Resumo dos resultados (execução padrão)

Com 200 repetições, `n_ref=1000`, `n_cur=500`:

| Método | AUC | Sensibilidade | Especificidade |
|---|---:|---:|---:|
| Wasserstein | 0,996 | 0,728 | 1,000 |
| KS | 0,992 | 0,952 | 0,945 |
| PSI | 0,979 | 0,532 | 1,000 |
| Jensen-Shannon | 0,940 | 0,673 | 1,000 |

Leitura:

- **KS** é o mais sensível a deslocamentos pequenos (0,2σ) e o mais rápido
  em latência, mas tem ~5% de falsos positivos (calibração nominal);
- **Wasserstein normalizado** tem a maior AUC e nenhum falso positivo,
  sendo robusto para mudanças de escala;
- **PSI** é conservador: detecta bem drift moderado/forte (>= 0,5σ), mas
  não drift baixo;
- **JS** com correção de viés é conservador em drift baixo e detecta
  integralmente o moderado/forte; tem a menor AUC no conjunto;
- a combinação (qualquer método crítico) atinge 100% de detecção nos
  cenários moderado/forte e mantém baixo falso positivo.

Esses resultados são sintéticos e servem para comparar a **sensibilidade
relativa** dos métodos; a replicação com PaySim deve usar
`evaluate_windows(reference, windows)`.

---

## 7. Análise estatística (T2.8)

`backend/experiments/statistical_analysis.py` oferece:

- `wilson_ci` — IC para proporções;
- `bootstrap_ci` / `bootstrap_auc_ci` — IC bootstrap;
- `roc_auc` — AUC via Mann-Whitney, com empates, sem scikit-learn;
- `classification_metrics` — sensibilidade, especificidade, precisão, F1,
  MCC, taxas de erro;
- `mcnemar_test` — teste exato ou chi-quadrado com correção;
- `cohens_kappa` — concordância entre métodos;
- `paired_comparison` — todos os pares, com Δ acurácia e IC.

O E3 aplica correção de Bonferroni para as comparações múltiplas
($\alpha / n_{\text{pares}}$).

---

## 8. Testes

```bash
# na raiz do repositório
python -m pytest tests/test_drift_methods.py tests/test_experiments.py tests/test_drift_api.py -v
```

Cobertura:

- PSI (incluindo valores fora do range e categóricas);
- KS (amostras iguais, deslocadas, constantes);
- JS (viés, categóricas, constantes disjuntas);
- Wasserstein (normalização, escala, constantes);
- limiares (direções e configuração parcial);
- detector (numérico, categórico, NaN, amostra insuficiente, DataFrame);
- alertas (agregação, severidade, deduplicação pura);
- E3 (estrutura, taxas, AUC, latência, relatório, JSON estrito);
- endpoints sem banco.

---

## 9. Limitações e cuidados

1. **Tamanho amostral:** PSI/JS/Wasserstein têm viés e variância que
   dependem de `n`. O detector sinaliza amostras < 30 e o JS aplica
   correção de viés; para janelas muito pequenas, prefira acumular janelas.
2. **KS e n grande:** diferenças irrelevantes podem ser significativas.
   Use a estatística `D` e os demais métodos para avaliar magnitude.
3. **Wasserstein bruto** não é comparável entre features; use o
   normalizado para decisão.
4. **Dados categóricos:** KS/Wasserstein não são calculados; a decisão usa
   PSI e JS.
5. **Drift conceitual:** os métodos comparam distribuições marginais; drift
   na relação feature→target (conceito) exige monitoramento de desempenho
   (Pessoa 1 / E4).
6. **Múltiplas features:** o alerta agrega features; para priorização, use
   `drift_score`, severidade e `per_feature`.
