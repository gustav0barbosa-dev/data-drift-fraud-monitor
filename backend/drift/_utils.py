"""Utilitários internos compartilhados pelos métodos de drift."""
from __future__ import annotations

from typing import Any

import numpy as np


def as_1d_numeric(
    values: Any,
    *,
    name: str = "values",
    categorical_hint: str | None = None,
) -> np.ndarray:
    """Converte a entrada em um vetor 1-D de floats finitos."""
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
        message = f"{name} deve conter apenas valores numéricos"
        if categorical_hint:
            message += f"; use {categorical_hint} para variáveis categóricas"
        raise TypeError(message) from exc

    array = array[np.isfinite(array)]
    if array.size == 0:
        raise ValueError(f"{name} não contém valores finitos")
    return array
