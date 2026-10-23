"""
Distância de Wasserstein (Earth Mover's Distance).

Para distribuições unidimensionais, a distância de Wasserstein de ordem 1
é a integral do módulo da diferença entre as CDFs::

    W1(P, Q) = ∫ |F_P(x) - F_Q(x)| dx

Interpretação: quantidade mínima de "massa" que precisa ser movida para
transformar uma distribuição na outra. Diferentemente do KS, o Wasserstein
captura a **magnitude** da mudança, não apenas a maior diferença pontual.

O valor bruto tem a mesma unidade da feature (ex.: reais), portanto não é
comparável entre features. Para decisão automatizada usamos a versão
**normalizada** pelo desvio-padrão (ou IQR) da referência::

    W1_norm = W1(P, Q) / escala(P)

Isso torna o limiar interpretável como "quantos desvios-padrão" a
distribuição se deslocou.
"""
from __future__ import annotations

from typing import Any, Literal

import numpy as np
from scipy.stats import wasserstein_distance

DEFAULT_EPSILON = 1e-12
ScaleMethod = Literal["std", "iqr"]


def _as_1d_numeric(values: Any, *, name: str) -> np.ndarray:
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


def calculate_wasserstein(reference: Any, current: Any) -> float:
    """
    Calcula a distância de Wasserstein bruta entre duas amostras.

    Returns:
        float: Distância >= 0, na mesma unidade dos dados.
    """
    ref = _as_1d_numeric(reference, name="reference")
    cur = _as_1d_numeric(current, name="current")
    return float(wasserstein_distance(ref, cur))


def _reference_scale(reference: np.ndarray, method: ScaleMethod) -> float:
    if method == "std":
        scale = float(np.std(reference, ddof=1)) if reference.size > 1 else 0.0
    elif method == "iqr":
        q75, q25 = np.percentile(reference, [75, 25])
        scale = float(q75 - q25)
    else:
        raise ValueError(f"Método de escala inválido: {method!r}")

    if scale <= DEFAULT_EPSILON:
        # Distribuição degenerada: qualquer mudança é tratada como relevante.
        scale = 1.0
    return scale


def calculate_wasserstein_normalized(
    reference: Any,
    current: Any,
    method: ScaleMethod = "std",
) -> float:
    """
    Calcula a distância de Wasserstein normalizada pela escala da referência.

    Args:
        reference: Amostra de referência.
        current: Amostra atual.
        method: ``"std"`` (desvio-padrão) ou ``"iqr"`` (intervalo interquartil).

    Returns:
        float: Distância normalizada (>= 0). Valores < 0.1 indicam mudança
        pequena; >= 0.25 indicam mudança relevante.
    """
    if method not in ("std", "iqr"):
        raise ValueError(f"Método de escala inválido: {method!r}")

    ref = _as_1d_numeric(reference, name="reference")
    cur = _as_1d_numeric(current, name="current")
    raw = float(wasserstein_distance(ref, cur))

    if raw == 0.0:
        return 0.0

    return float(raw / _reference_scale(ref, method))
