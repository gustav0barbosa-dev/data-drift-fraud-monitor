# E4 — Retreinamento orientado por alertas

Gerado em `2026-10-27T13:15:51.556491+00:00`.

## Configuração

- Dataset: **sintético (PaySim)** (60,000 transações)
- Janelas: **12** | ramp de drift: **4** janelas | nível final: **high**
- Cooldown entre retreinos: **2** janelas | buffer de treino: **4** janelas
- Gatilho: drift crítico do detector ou PSI ≥ 0.15
- Baseline: **v1.1.0-xgb** (XGBoost)

## Comparação agregada

| Política | F1 médio | Recall | Precision | AUC-ROC | PR-AUC | F1 (últimas janelas) |
| --- | --- | --- | --- | --- | --- | --- |
| sem retreino | 0.2579 | 0.1618 | 0.8561 | 0.8163 | 0.2517 | 0.2289 |
| retreino por alerta | 0.6275 | 0.7641 | 0.6055 | 0.9660 | 0.6623 | 0.6269 |

## Eventos de retreinamento

| Janela | Status | Versão | PSI | Linhas | Janelas de treino |
| --- | --- | --- | --- | --- | --- |
| W02 | completed | v1.2.0-xgb | 0.0782 | 4500 | ['W01', 'W02'] |
| W04 | completed | v1.3.0-xgb | 0.2265 | 9000 | ['W01', 'W02', 'W03', 'W04'] |
| W06 | completed | v1.4.0-xgb | 0.1893 | 9000 | ['W03', 'W04', 'W05', 'W06'] |
| W08 | completed | v1.5.0-xgb | 0.1799 | 9000 | ['W05', 'W06', 'W07', 'W08'] |
| W10 | completed | v1.6.0-xgb | 0.2122 | 9000 | ['W07', 'W08', 'W09', 'W10'] |
| W12 | completed | v1.7.0-xgb | 0.1877 | 9000 | ['W09', 'W10', 'W11', 'W12'] |

## Métricas por janela

| Janela | Intensidade | PSI | Alerta | F1 s/ retreino | F1 c/ retreino | Recall s/ retreino | Recall c/ retreino |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | 0.3000 | 0.0285 | sim | 0.6512 | 0.6512 | 0.5185 | 0.5185 |
| W02 | 0.6000 | 0.0782 | sim | 0.3556 | 0.3556 | 0.2162 | 0.2162 |
| W03 | 0.9000 | 0.1405 | sim | 0.2687 | 0.6471 | 0.1607 | 0.7857 |
| W04 | 1.2000 | 0.2265 | sim | 0.1538 | 0.5868 | 0.0833 | 0.6806 |
| W05 | 1.2000 | 0.1795 | sim | 0.2439 | 0.7421 | 0.1429 | 0.8429 |
| W06 | 1.2000 | 0.1893 | sim | 0.2000 | 0.6587 | 0.1127 | 0.7746 |
| W07 | 1.2000 | 0.2120 | sim | 0.1463 | 0.6630 | 0.0822 | 0.8219 |
| W08 | 1.2000 | 0.1799 | sim | 0.2105 | 0.6667 | 0.1190 | 0.7619 |
| W09 | 1.2000 | 0.2103 | sim | 0.1778 | 0.6786 | 0.1013 | 0.9620 |
| W10 | 1.2000 | 0.2122 | sim | 0.2588 | 0.6385 | 0.1549 | 0.9577 |
| W11 | 1.2000 | 0.2405 | sim | 0.2740 | 0.5789 | 0.1667 | 0.9167 |
| W12 | 1.2000 | 0.1877 | sim | 0.1538 | 0.6634 | 0.0833 | 0.9306 |

## Resumo

- Alertas de drift: **12** (primeiro em W01)
- Retreinos concluídos: **6** (primeiro em W02)
- Janelas até recuperar 90% do F1 inicial: **1**
- Ganho de F1 nas últimas janelas: **0.3981**

O retreinamento por alerta usa apenas dados rotulados já disponíveis e só entra em produção na janela seguinte, reproduzindo a latência real entre detecção, treino e implantação.
