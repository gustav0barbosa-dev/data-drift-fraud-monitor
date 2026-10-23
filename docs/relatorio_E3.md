# Relatório E3 — Comparação dos métodos de detecção de drift

> Gerado automaticamente por `backend/experiments/e3_detection_methods.py` em 2026-10-23T13:23:03.084868+00:00.

## 1. Metodologia

Foram geradas amostras sintéticas de uma feature contínua (referência: n=1000; atual: n=500) em 200 repetições Monte Carlo por cenário. O drift foi induzido por deslocamento de média e mudança de escala, em unidades de desvio-padrão da referência.

Cada método decide drift aplicando seus limiares críticos (trigger = `critical`):

| Método | Warning | Critical | Direção |
|---|---:|---:|---|
| PSI | 0.1 | 0.25 | above |
| KS | 0.1 | 0.05 | below |
| Jensen-Shannon | 0.05 | 0.1 | above |
| Wasserstein | 0.1 | 0.25 | above |

### Cenários

| Cenário | Deslocamento (σ) | Escala | Rótulo | Descrição |
|---|---:|---:|---|---|
| none | 0.00 | 1.00 | sem drift | Sem drift (controle) |
| low | 0.20 | 1.05 | drift | Drift baixo: deslocamento de 0,2σ |
| moderate | 0.50 | 1.20 | drift | Drift moderado: 0,5σ + 20% de escala |
| high | 1.00 | 1.50 | drift | Drift forte: 1,0σ + 50% de escala |

## 2. Sensibilidade e especificidade

A taxa de detecção é a sensibilidade nos cenários com drift e a taxa de falso positivo (1 − especificidade) no cenário `none`. Intervalos de confiança de Wilson (95%).

| Cenário | Método | Taxa de detecção | IC 95% |
|---|---|---:|---|
| none | PSI | 0.000 | [0.000, 0.019] |
| none | KS | 0.055 | [0.031, 0.096] |
| none | Jensen-Shannon | 0.000 | [0.000, 0.019] |
| none | Wasserstein | 0.000 | [0.000, 0.019] |
| low | PSI | 0.000 | [0.000, 0.019] |
| low | KS | 0.855 | [0.800, 0.897] |
| low | Jensen-Shannon | 0.020 | [0.008, 0.050] |
| low | Wasserstein | 0.185 | [0.137, 0.245] |
| moderate | PSI | 0.595 | [0.526, 0.661] |
| moderate | KS | 1.000 | [0.981, 1.000] |
| moderate | Jensen-Shannon | 1.000 | [0.981, 1.000] |
| moderate | Wasserstein | 1.000 | [0.981, 1.000] |
| high | PSI | 1.000 | [0.981, 1.000] |
| high | KS | 1.000 | [0.981, 1.000] |
| high | Jensen-Shannon | 1.000 | [0.981, 1.000] |
| high | Wasserstein | 1.000 | [0.981, 1.000] |

## 3. Poder de discriminação (AUC-ROC)

A AUC foi calculada com os scores contínuos de cada método, agregando os quatro cenários (drift vs. sem drift). Para o KS usamos `1 − p-valor` como score.

| Método | AUC | IC 95% (bootstrap) | Sensibilidade | Especificidade | F1 | MCC |
|---|---:|---|---:|---:|---:|---:|
| PSI | 0.979 | [0.971, 0.987] | 0.532 | 1.000 | 0.694 | 0.470 |
| KS | 0.992 | [0.987, 0.995] | 0.952 | 0.945 | 0.966 | 0.872 |
| Jensen-Shannon | 0.940 | [0.926, 0.953] | 0.673 | 1.000 | 0.805 | 0.583 |
| Wasserstein | 0.996 | [0.992, 0.998] | 0.728 | 1.000 | 0.843 | 0.633 |

## 4. Latência de detecção

O drift cresce linearmente até a intensidade máxima em 5 janelas. A latência é o número da janela em que o método dispara pela primeira vez. Valores não detectados até 12 janelas são censurados.

| Cenário | Método | Taxa de detecção | Mediana (janelas) | Média (janelas) |
|---|---|---:|---:|---:|
| low | PSI | 0.000 | n/d | 13.00 |
| low | KS | 1.000 | 4.0 | 4.00 |
| low | Jensen-Shannon | 0.080 | n/d | 12.78 |
| low | Wasserstein | 0.760 | 8.0 | 8.46 |
| low | any | 1.000 | 4.0 | 4.00 |
| moderate | PSI | 1.000 | 5.0 | 5.38 |
| moderate | KS | 1.000 | 2.0 | 1.90 |
| moderate | Jensen-Shannon | 1.000 | 4.0 | 3.78 |
| moderate | Wasserstein | 1.000 | 3.0 | 2.90 |
| moderate | any | 1.000 | 2.0 | 1.90 |
| high | PSI | 1.000 | 3.0 | 2.92 |
| high | KS | 1.000 | 1.0 | 1.16 |
| high | Jensen-Shannon | 1.000 | 2.0 | 2.12 |
| high | Wasserstein | 1.000 | 2.0 | 1.68 |
| high | any | 1.000 | 1.0 | 1.16 |

## 5. Concordância e testes pareados

McNemar compara a acurácia dos métodos nas mesmas amostras. Com 6 comparações, o alfa de Bonferroni é 0.0083.

| Comparação | Kappa | Concordância | McNemar p | Δ acurácia | IC 95% do Δ |
|---|---:|---:|---:|---:|---|
| psi vs ks | 0.398 | 0.671 | 0.0000 | -0.301 | [-0.334, -0.265] |
| psi vs js | 0.788 | 0.894 | 0.0000 | -0.106 | [-0.128, -0.085] |
| psi vs wasserstein | 0.710 | 0.853 | 0.0000 | -0.147 | [-0.171, -0.122] |
| ks vs js | 0.553 | 0.777 | 0.0000 | +0.195 | [+0.166, +0.225] |
| ks vs wasserstein | 0.622 | 0.819 | 0.0000 | +0.154 | [+0.126, +0.181] |
| js vs wasserstein | 0.917 | 0.959 | 0.0000 | -0.041 | [-0.056, -0.029] |

## 6. Ranking e leitura dos resultados

- **AUC:** Wasserstein > KS > PSI > Jensen-Shannon
- **Sensibilidade agregada:** KS > Wasserstein > Jensen-Shannon > PSI
- **Menor taxa de falso positivo:** PSI > Jensen-Shannon > Wasserstein > KS
- **Menor latência média:** KS > Wasserstein > Jensen-Shannon > PSI

O método com maior AUC foi **Wasserstein**. O mais sensível foi **KS**, enquanto **PSI** apresentou a menor taxa de falso positivo. Na simulação sequencial, **KS** detectou o drift mais cedo em média.

Observação: o teste KS tende a ser muito sensível com amostras grandes, detectando diferenças de pequena magnitude; PSI, JS e Wasserstein capturam melhor a magnitude da mudança. Por isso o sistema combina os métodos e reporta a severidade, em vez de depender de um único teste.

## 7. Limitações

- Os cenários sintéticos usam distribuições normais; dados reais (PaySim) têm forte assimetria e valores extremos.
- O p-valor do KS depende do tamanho amostral; comparações entre janelas de tamanhos diferentes exigem cautela.
- A latência simulada assume drift gradual e janelas independentes.
- A AUC agrega cenários com efeitos de tamanhos diferentes; as tabelas por cenário devem ser consultadas para decisões finas.
