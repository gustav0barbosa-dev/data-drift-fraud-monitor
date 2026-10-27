# backend/drift/interface.py
"""
Contratos (interfaces) do módulo de Drift.

Define o que a API espera do módulo de detecção de drift. A implementação
concreta é :class:`drift.detector.DriftDetector`.
"""
from typing import Iterable, Optional, Protocol

import numpy as np


class DriftDetectorProtocol(Protocol):
    """Interface do detector de drift."""

    def detect(
        self,
        reference: np.ndarray,
        current: np.ndarray,
        *,
        feature_name: Optional[str] = None,
        categorical: Optional[bool] = None,
        methods: Optional[Iterable[str]] = None,
    ) -> dict:
        """
        Detecta drift entre duas amostras.

        Args:
            reference: Dados de referência (treinamento).
            current: Dados atuais (produção).
            feature_name: Nome opcional da feature.
            categorical: Força o tratamento categórico.
            methods: Subconjunto de ``psi``, ``ks``, ``js`` e ``wasserstein``.

        Returns:
            dict: {
                "psi": float | None,
                "ks_stat": float | None,
                "ks_pvalue": float | None,
                "js": float | None,
                "wasserstein": float | None,
                "wasserstein_normalized": float | None,
                "is_drift": bool,
                "severity": "none" | "warning" | "critical",
                "drift_score": float,
                "methods": dict,
                "warnings": list[str],
            }
        """
        ...
