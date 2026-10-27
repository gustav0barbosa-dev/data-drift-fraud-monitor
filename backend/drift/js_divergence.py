"""
Divergência de Jensen-Shannon (JS).

A divergência JS é uma versão simétrica e limitada da divergência de
Kullback-Leibler::

    JS(P || Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M),  M = 0.5 * (P + Q)

Propriedades:

- ``JS >= 0`` e ``JS = 0`` se, e somente se, ``P == Q``;
- é simétrica: ``JS(P || Q) = JS(Q || P)``;
- usando logaritmo natural, ``0 <= JS <= ln(2)``;
- usando logaritmo na base 2, ``0 <= JS <= 1``.

Convenção deste módulo (compatível com ``scipy.spatial.distance.jensenshannon``):

- :func:`calculate_js` retorna a **distância** ``sqrt(JS)`` (0 a ~0.83);
- :func:`calculate_js_divergence` retorna a **divergência** ``JS``.

Os limiares padrão em :mod:`drift.thresholds` são aplicados à distância.
"""
from __future__ import annotations

from collections import Counter
from typing import Any
import math

import numpy as np
from scipy.spatial.distance import jensenshannon

from drift._utils import as_1d_numeric

DEFAULT_BINS = 10
DEFAULT_EPSILON = 1e-12


def _normalize(probabilities: np.ndarray, epsilon: float) -> np.ndarray:
    probabilities = np.clip(probabilities.astype(float), epsilon, None)
    return probabilities / probabilities.sum()


def _numeric_probabilities(
    reference: np.ndarray,
    current: np.ndarray,
    bins: int,
    epsilon: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Histogramas normalizados com bins comuns às duas amostras."""
    if bins < 2:
        raise ValueError("bins deve ser >= 2")

    minimum = float(min(reference.min(), current.min()))
    maximum = float(max(reference.max(), current.max()))

    if minimum == maximum:
        # Ambas as amostras são constantes.
        return np.array([1.0]), np.array([1.0])

    edges = np.linspace(minimum, maximum, bins + 1)
    ref_counts, _ = np.histogram(reference, bins=edges)
    cur_counts, _ = np.histogram(current, bins=edges)

    # np.histogram inclui o limite direito no último bin; a inclusão de todos
    # os pontos é garantida porque as bordas cobrem [min, max].
    ref_p = _normalize(ref_counts / ref_counts.sum(), epsilon)
    cur_p = _normalize(cur_counts / cur_counts.sum(), epsilon)
    return ref_p, cur_p


def calculate_js(
    reference: Any,
    current: Any,
    bins: int = DEFAULT_BINS,
    epsilon: float = DEFAULT_EPSILON,
    base: float | None = None,
    bias_correction: bool = False,
) -> float:
    """
    Calcula a **distância** Jensen-Shannon entre duas distribuições numéricas.

    Args:
        reference: Amostra de referência.
        current: Amostra atual.
        bins: Número de bins do histograma.
        epsilon: Piso para evitar ``log(0)``.
        base: Base do logaritmo (``None`` = log natural, ``2`` = bits).
        bias_correction: Se ``True``, subtrai a divergência esperada sob a
            hipótese nula (finita amostra), reduzindo falsos positivos com
            amostras pequenas. Ver :func:`_null_divergence`.

    Returns:
        float: Distância JS em ``[0, 1]``.
    """
    ref = as_1d_numeric(
        reference, name="reference", categorical_hint="calculate_js_categorical"
    )
    cur = as_1d_numeric(
        current, name="current", categorical_hint="calculate_js_categorical"
    )

    ref_p, cur_p = _numeric_probabilities(ref, cur, bins, epsilon)

    distance = jensenshannon(ref_p, cur_p, base=base)
    distance = float(np.clip(distance, 0.0, 1.0))

    if bias_correction:
        divergence = distance**2
        correction = _null_divergence(
            n_reference=ref.size,
            n_current=cur.size,
            n_bins=max(2, min(ref_p.size, cur_p.size)),
            base=base,
        )
        distance = float(np.sqrt(max(divergence - correction, 0.0)))

    return distance


def _null_divergence(
    *,
    n_reference: int,
    n_current: int,
    n_bins: int,
    base: float | None = None,
) -> float:
    """
    Divergência JS esperada sob H0 para histogramas de ``n_bins`` bins.

    Aproximação assintótica: ``E[JS] ≈ 0,25 * (k - 1) * (1/n1 + 1/n2)``
    (log natural). É o viés positivo do estimador plug-in; subtraí-lo
    calibra o limiar para o tamanho amostral.
    """
    if n_reference <= 0 or n_current <= 0 or n_bins <= 1:
        return 0.0

    expected_natural = 0.25 * (n_bins - 1) * (
        1.0 / n_reference + 1.0 / n_current
    )
    if base is None:
        return expected_natural
    if base <= 0 or base == 1:
        raise ValueError("base deve ser > 0 e != 1")
    return expected_natural / math.log(base)


def calculate_js_divergence(
    reference: Any,
    current: Any,
    bins: int = DEFAULT_BINS,
    epsilon: float = DEFAULT_EPSILON,
    base: float = 2.0,
    bias_correction: bool = False,
) -> float:
    """
    Calcula a **divergência** Jensen-Shannon (quadrado da distância).

    Com ``base=2`` o resultado está no intervalo ``[0, 1]``.
    """
    distance = calculate_js(
        reference,
        current,
        bins=bins,
        epsilon=epsilon,
        base=base,
        bias_correction=bias_correction,
    )
    return float(np.clip(distance**2, 0.0, 1.0))


def calculate_js_categorical(
    reference: Any,
    current: Any,
    epsilon: float = DEFAULT_EPSILON,
    base: float | None = None,
    bias_correction: bool = False,
) -> float:
    """
    Calcula a distância JS entre duas distribuições categóricas.

    As categorias consideradas são a união das observadas nas duas amostras.
    """
    if reference is None or current is None:
        raise ValueError("reference e current não podem ser None")

    ref_array = np.asarray(reference).ravel().tolist()
    cur_array = np.asarray(current).ravel().tolist()

    ref_clean = [v for v in ref_array if v is not None and not _is_nan(v)]
    cur_clean = [v for v in cur_array if v is not None and not _is_nan(v)]

    if not ref_clean or not cur_clean:
        raise ValueError("Amostras categóricas não podem estar vazias")

    ref_counter = Counter(ref_clean)
    cur_counter = Counter(cur_clean)
    categories = sorted(set(ref_counter) | set(cur_counter), key=lambda v: str(v))

    ref_p = _normalize(
        np.array([ref_counter.get(c, 0) for c in categories], dtype=float) / len(ref_clean),
        epsilon,
    )
    cur_p = _normalize(
        np.array([cur_counter.get(c, 0) for c in categories], dtype=float) / len(cur_clean),
        epsilon,
    )

    distance = jensenshannon(ref_p, cur_p, base=base)
    distance = float(np.clip(distance, 0.0, 1.0))

    if bias_correction:
        divergence = distance**2
        correction = _null_divergence(
            n_reference=len(ref_clean),
            n_current=len(cur_clean),
            n_bins=max(2, len(categories)),
            base=base,
        )
        distance = float(np.sqrt(max(divergence - correction, 0.0)))

    return distance


def _is_nan(value: Any) -> bool:
    try:
        return bool(np.isnan(value))
    except (TypeError, ValueError):
        return False
