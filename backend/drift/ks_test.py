"""
Teste de Kolmogorov-Smirnov de duas amostras.

O teste KS compara as funções de distribuição acumulada empíricas (ECDF) de
duas amostras. A estatística ``D`` é a maior distância vertical entre elas::

    D = sup_x |F_ref(x) - F_atual(x)|

Hipóteses:

    H0: as duas amostras vêm da mesma distribuição
    H1: as distribuições diferem

Rejeitamos H0 quando o p-valor é menor que o nível de significância
(padrão ``alpha = 0.05``). O p-valor é sensível ao tamanho amostral: com
amostras muito grandes, diferenças irrelevantes podem ser significativas.
Por isso o sistema combina o KS com métricas de magnitude (PSI, JS e
Wasserstein) e reporta também a estatística ``D`` como tamanho de efeito.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy import stats


def _as_1d(values: Any, *, name: str) -> np.ndarray:
    if values is None:
        raise ValueError(f"{name} não pode ser None")

    array = np.asarray(values)
    if array.ndim == 0:
        array = array.reshape(1)
    elif array.ndim > 1:
        array = array.ravel()

    try:
        array = array.astype(float)
    except (TypeError, ValueError) as exc:
        raise TypeError(
            f"{name} deve conter apenas valores numéricos"
        ) from exc

    array = array[np.isfinite(array)]
    if array.size == 0:
        raise ValueError(f"{name} não contém valores finitos")
    return array


def calculate_ks(reference: Any, current: Any) -> tuple[float, float]:
    """
    Calcula o teste KS de duas amostras.

    Args:
        reference: Amostra de referência.
        current: Amostra atual.

    Returns:
        tuple: ``(estatística D, p-valor)``. Ambos em ``[0, 1]``.

    Raises:
        ValueError: Se alguma amostra estiver vazia.
        TypeError: Se os dados não forem numéricos.
    """
    ref = _as_1d(reference, name="reference")
    cur = _as_1d(current, name="current")

    statistic, pvalue = stats.ks_2samp(ref, cur, alternative="two-sided", method="auto")

    # Protege contra eventuais valores fora do intervalo por arredondamento.
    statistic = float(np.clip(statistic, 0.0, 1.0))
    pvalue = float(np.clip(pvalue, 0.0, 1.0))
    return statistic, pvalue


def calculate_ks_detailed(
    reference: Any,
    current: Any,
    alpha: float = 0.05,
) -> dict[str, float | bool | str]:
    """
    Versão detalhada do teste KS.

    Returns:
        dict com ``statistic``, ``p_value``, ``alpha``, ``is_drift`` e
        ``effect_size`` (classificação qualitativa de ``D``).
    """
    if not 0 < alpha < 1:
        raise ValueError("alpha deve estar entre 0 e 1")

    statistic, pvalue = calculate_ks(reference, current)

    if statistic < 0.10:
        effect_size = "negligible"
    elif statistic < 0.20:
        effect_size = "small"
    elif statistic < 0.35:
        effect_size = "medium"
    else:
        effect_size = "large"

    return {
        "statistic": statistic,
        "p_value": pvalue,
        "alpha": float(alpha),
        "is_drift": bool(pvalue < alpha),
        "effect_size": effect_size,
    }
