# E1 — Baseline sem Data Drift

Gerado em `2026-10-27T13:15:24.307128+00:00`.

## Configuração

- Dataset: **sintético (PaySim)** (60,000 transações, 0.498% de fraude)
- Janelas temporais: **12**
- Split temporal: 42,000 treino / 18,000 teste (corte no step 519)
- Modelo: **v1.1.0-xgb** (XGBoost)

## Métricas do baseline (conjunto de teste)

| Precision | Recall | F1 | AUC-ROC | PR-AUC | Accuracy |
| --- | --- | --- | --- | --- | --- |
| 0.8764 | 0.8571 | 0.8667 | 0.9983 | 0.9132 | 0.9987 |

## Estabilidade ao longo das janelas (sem drift)

| Janela | Linhas | Fraude | Precision | Recall | F1 | AUC-ROC | PR-AUC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | 1500 | 0.0053 | 0.8571 | 0.7500 | 0.8000 | 0.9967 | 0.8417 |
| W02 | 1500 | 0.0060 | 1.0000 | 0.8889 | 0.9412 | 0.9994 | 0.9477 |
| W03 | 1500 | 0.0040 | 1.0000 | 0.8333 | 0.9091 | 0.9987 | 0.8889 |
| W04 | 1500 | 0.0040 | 0.6667 | 0.6667 | 0.6667 | 0.9900 | 0.7410 |
| W05 | 1500 | 0.0047 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| W06 | 1500 | 0.0060 | 0.8750 | 0.7778 | 0.8235 | 0.9983 | 0.8722 |
| W07 | 1500 | 0.0073 | 0.8182 | 0.8182 | 0.8182 | 0.9985 | 0.9044 |
| W08 | 1500 | 0.0053 | 0.8889 | 1.0000 | 0.9412 | 1.0000 | 1.0000 |
| W09 | 1500 | 0.0060 | 0.8750 | 0.7778 | 0.8235 | 0.9984 | 0.8772 |
| W10 | 1500 | 0.0040 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| W11 | 1500 | 0.0060 | 0.8889 | 0.8889 | 0.8889 | 0.9999 | 0.9798 |
| W12 | 1500 | 0.0020 | 0.6000 | 1.0000 | 0.7500 | 1.0000 | 1.0000 |

## Resumo

- F1 médio: **0.8635** (σ = 0.0970)
- AUC-ROC médio: **0.9983**
- PR-AUC médio: **0.9211**
- Variação do F1 entre a primeira e a última janela: **-0.0500**

Sem drift, espera-se que as métricas permaneçam estáveis entre as janelas. Qualquer queda sistemática aqui indica instabilidade temporal do próprio dataset (não efeito do drift).
