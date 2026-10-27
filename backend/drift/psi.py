"""
Population Stability Index (PSI).

O PSI mede o quanto a distribuição de uma variável mudou entre uma população
de referência (treinamento) e uma população atual (produção)::

    PSI = Σ (P_atual(i) - P_ref(i)) * ln(P_atual(i) / P_ref(i))

Interpretação usual (Siddiqi, 2006):

    PSI < 0.10          -> distribuição estável
    0.10 <= PSI < 0.25  -> mudança moderada (monitorar)
    PSI >= 0.25         -> mudança significativa (alerta)

Para variáveis numéricas os bins são quantis da referência. As bordas
externas são abertas (-inf, +inf), garantindo que valores atuais fora do
intervalo observado na referência também sejam contabilizados — um erro
comum em implementações ingênuas que usam ``np.histogram`` diretamente.

Para variáveis categóricas use :func:`calculate_psi_categorical`.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

from drift._utils import as_1d_numeric

DEFAULT_EPSILON = 1e-6
DEFAULT_BINS = 10

# Faixas de interpretação.
PSI_STABLE_THRESHOLD = 0.10
PSI_SIGNIFICANT_THRESHOLD = 0.25


def _clean_categorical(values: Any) -> list[Any]:
    """Remove valores ausentes/NaN de uma sequência categórica."""
    if values is None:
        raise ValueError("values não pode ser None")

    array = np.asarray(values)
    if array.ndim > 1:
        array = array.ravel()

    cleaned: list[Any] = []
    for value in array.tolist():
        if value is None:
            continue
        if isinstance(value, float) and np.isnan(value):
            continue
        cleaned.append(value)

    if not cleaned:
        raise ValueError("values não contém valores válidos")
    return cleaned


def _numeric_bin_edges(reference: np.ndarray, bins: int) -> np.ndarray:
    """
    Cria bordas de bins baseadas em quantis da referência.

    Se a referência for constante (ou quase), cria três faixas ao redor do
    valor para que o PSI ainda consiga detectar uma mudança de nível.
    """
    if bins < 2:
        raise ValueError("bins deve ser >= 2")

    edges = np.unique(np.percentile(reference, np.linspace(0, 100, bins + 1)))

    # Referência constante: três faixas estreitas ao redor do valor.
    if edges.size == 1:
        center = float(edges[0])
        span = max(abs(center) * 1e-6, 1e-9)
        return np.array([-np.inf, center - span, center + span, np.inf])

    # Apenas dois valores únicos: preserva o maior valor como fronteira.
    if edges.size == 2:
        return np.array([-np.inf, edges[1], np.inf])

    # Bordas abertas: valores atuais fora do range de referência contam.
    return np.concatenate(([-np.inf], edges[1:-1], [np.inf]))


def calculate_psi(
    reference: Any,
    current: Any,
    bins: int = DEFAULT_BINS,
    epsilon: float = DEFAULT_EPSILON,
) -> float:
    """
    Calcula o PSI entre duas distribuições numéricas.

    Args:
        reference: Dados de referência (ex.: treinamento).
        current: Dados atuais (ex.: produção).
        bins: Número de bins (quantis da referência).
        epsilon: Piso para evitar ``log(0)``.

    Returns:
        float: Valor do PSI (>= 0).

    Raises:
        ValueError: Se as amostras estiverem vazias ou ``bins < 2``.
        TypeError: Se os dados não forem numéricos.
    """
    ref = as_1d_numeric(
        reference, name="reference", categorical_hint="calculate_psi_categorical"
    )
    cur = as_1d_numeric(
        current, name="current", categorical_hint="calculate_psi_categorical"
    )

    edges = _numeric_bin_edges(ref, bins)

    ref_counts, _ = np.histogram(ref, bins=edges)
    cur_counts, _ = np.histogram(cur, bins=edges)

    ref_pct = ref_counts / ref_counts.sum()
    cur_pct = cur_counts / cur_counts.sum()

    epsilon = float(epsilon)
    if epsilon <= 0:
        raise ValueError("epsilon deve ser > 0")

    ref_pct = np.clip(ref_pct, epsilon, None)
    cur_pct = np.clip(cur_pct, epsilon, None)

    # Normaliza após o clipping para preservar a massa de probabilidade.
    ref_pct = ref_pct / ref_pct.sum()
    cur_pct = cur_pct / cur_pct.sum()

    psi = np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct))
    return float(max(psi, 0.0))


def calculate_psi_categorical(
    reference: Any,
    current: Any,
    epsilon: float = DEFAULT_EPSILON,
) -> float:
    """
    Calcula o PSI para variáveis categóricas.

    As categorias são a união das observadas na referência e no atual.
    Categorias ausentes em um dos lados recebem frequência ``epsilon``.
    """
    ref = _clean_categorical(reference)
    cur = _clean_categorical(current)

    ref_counter = Counter(ref)
    cur_counter = Counter(cur)

    categories = sorted(set(ref_counter) | set(cur_counter), key=lambda v: str(v))
    if not categories:
        raise ValueError("Não há categorias para calcular o PSI")

    ref_pct = np.array([ref_counter.get(c, 0) / len(ref) for c in categories], dtype=float)
    cur_pct = np.array([cur_counter.get(c, 0) / len(cur) for c in categories], dtype=float)

    epsilon = float(epsilon)
    if epsilon <= 0:
        raise ValueError("epsilon deve ser > 0")

    ref_pct = np.clip(ref_pct, epsilon, None)
    cur_pct = np.clip(cur_pct, epsilon, None)
    ref_pct = ref_pct / ref_pct.sum()
    cur_pct = cur_pct / cur_pct.sum()

    psi = np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct))
    return float(max(psi, 0.0))


def interpret_psi(
    psi: float,
    stable_threshold: float = PSI_STABLE_THRESHOLD,
    significant_threshold: float = PSI_SIGNIFICANT_THRESHOLD,
) -> str:
    """
    Retorna uma interpretação textual do PSI.

    Returns:
        ``"stable"``, ``"moderate"`` ou ``"significant"``.
    """
    if psi < stable_threshold:
        return "stable"
    if psi < significant_threshold:
        return "moderate"
    return "significant"


def psi_components(
    reference: Any,
    current: Any,
    bins: int = DEFAULT_BINS,
    epsilon: float = DEFAULT_EPSILON,
) -> dict[str, Any]:
    """
    Retorna o PSI e suas componentes por bin (útil para debug/relatórios).

    Returns:
        dict com ``psi``, ``bin_edges``, ``reference_pct``, ``current_pct``
        e ``contributions``.
    """
    ref = as_1d_numeric(
        reference, name="reference", categorical_hint="calculate_psi_categorical"
    )
    cur = as_1d_numeric(
        current, name="current", categorical_hint="calculate_psi_categorical"
    )
    edges = _numeric_bin_edges(ref, bins)

    ref_counts, _ = np.histogram(ref, bins=edges)
    cur_counts, _ = np.histogram(cur, bins=edges)

    ref_pct = np.clip(ref_counts / ref_counts.sum(), epsilon, None)
    cur_pct = np.clip(cur_counts / cur_counts.sum(), epsilon, None)
    ref_pct = ref_pct / ref_pct.sum()
    cur_pct = cur_pct / cur_pct.sum()

    contributions = (cur_pct - ref_pct) * np.log(cur_pct / ref_pct)

    return {
        "psi": float(max(contributions.sum(), 0.0)),
        "bin_edges": [float(edge) for edge in edges],
        "reference_pct": [float(value) for value in ref_pct],
        "current_pct": [float(value) for value in cur_pct],
        "contributions": [float(value) for value in contributions],
        "interpretation": interpret_psi(float(max(contributions.sum(), 0.0))),
    }
