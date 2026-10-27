"""
Preditor de fraude (T1.8).

``FraudPredictor`` carrega o artefato versionado produzido por
``ml.train``/``ml.retrain`` e aplica **exatamente** a mesma engenharia de
features do treino (``ml.model.prepare_inference_frame``), eliminando o
train/serving skew. Artefatos antigos (estimador puro salvo com joblib) também
continuam aceitos por compatibilidade.

``MockFraudPredictor`` é o modo degradado usado quando nenhum artefato treinado
está disponível: mantém a API e o dashboard funcionais sem o pipeline de ML.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from ml.model import (
    DECISION_THRESHOLD,
    FraudModel,
    load_artifact,
    prepare_inference_frame,
)

logger = logging.getLogger(__name__)


class FraudPredictor:
    """Preditor de fraude baseado no artefato versionado (XGBoost/sklearn)."""

    def __init__(self, model_path: Optional[str] = None, *, threshold: float = DECISION_THRESHOLD):
        self.model: Optional[FraudModel] = None
        self.artifact: Optional[dict[str, Any]] = None
        self.model_path = model_path
        self.feature_names: Optional[list[str]] = None
        self.threshold = float(threshold)
        self.mode = "model"

        if model_path:
            self.load_model(model_path)

    # ------------------------------------------------------------------
    # Carregamento
    # ------------------------------------------------------------------
    def load_model(self, model_path: str) -> None:
        """Carrega o artefato do disco (formato versionado ou legado)."""
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"Modelo não encontrado: {model_path}")

        artifact = load_artifact(path)
        self.artifact = artifact
        self.model = FraudModel.from_artifact(artifact)
        self.feature_names = list(artifact.get("features") or self.model.features)
        self.threshold = float(
            artifact.get("decision_threshold", self.threshold)
        )
        self.model_path = str(path)
        self.mode = "model"
        logger.info(
            "Modelo carregado: %s (versão=%s, tipo=%s)",
            path,
            artifact.get("version", "legacy"),
            artifact.get("model_type"),
        )

    @property
    def version(self) -> Optional[str]:
        """Versão do artefato carregado (``None`` para artefatos legados)."""
        return (self.artifact or {}).get("version")

    def is_loaded(self) -> bool:
        """Verifica se o modelo está carregado."""
        return self.model is not None

    # ------------------------------------------------------------------
    # Inferência
    # ------------------------------------------------------------------
    def _prepare(self, transactions: list[dict] | pd.DataFrame) -> pd.DataFrame:
        if not self.is_loaded():
            raise RuntimeError("Modelo não carregado")

        frame = prepare_inference_frame(transactions)
        features = self.feature_names or self.model.features  # type: ignore[union-attr]
        missing = [column for column in features if column not in frame.columns]
        if missing:
            raise ValueError(f"Features ausentes na transação: {missing}")
        return frame[features]

    def predict(self, transaction: dict) -> dict:
        """
        Realiza a predição de uma transação.

        Returns:
            dict: ``{"is_fraud": bool, "probability": float, "model_version": str}``
        """
        features = self._prepare([transaction])
        probability = float(self.model.predict_proba(features)[0])  # type: ignore[union-attr]
        return {
            "is_fraud": bool(probability >= self.threshold),
            "probability": round(probability, 5),
            "model_version": self.version,
        }

    def predict_batch(self, transactions: list[dict]) -> list[dict]:
        """Realiza a predição de um lote de transações."""
        if not transactions:
            return []

        features = self._prepare(transactions)
        probabilities = self.model.predict_proba(features)  # type: ignore[union-attr]
        return [
            {
                "is_fraud": bool(probability >= self.threshold),
                "probability": round(float(probability), 5),
                "model_version": self.version,
            }
            for probability in np.asarray(probabilities).ravel()
        ]


class MockFraudPredictor:
    """
    Preditor determinístico usado quando nenhum artefato treinado está disponível.

    Não substitui o modelo real: existe para que a API, o dashboard e os testes
    continuem funcionais em ambientes sem o pipeline de treinamento (Pessoa 1).
    A probabilidade é uma heurística estável baseada em sinais conhecidos de
    fraude do PaySim (tipo da transação, valor e variação de saldo).
    """

    model = None
    feature_names = None
    mode = "mock"
    version = "mock-0.0.0"

    # Peso por tipo de transação observado no PaySim.
    _TYPE_WEIGHTS = {
        "TRANSFER": 0.35,
        "CASH_OUT": 0.30,
        "PAYMENT": 0.05,
        "CASH_IN": 0.02,
        "DEBIT": 0.03,
    }

    def __init__(self, model_path: str = "mock://heuristic"):
        self.model_path = model_path

    def is_loaded(self) -> bool:
        """O preditor mock está sempre disponível."""
        return True

    def load_model(self, model_path: str) -> None:  # pragma: no cover - no-op
        """Compatibilidade de interface."""
        self.model_path = model_path

    def _probability(self, transaction: dict) -> float:
        transaction_type = str(transaction.get("type") or "PAYMENT").upper()
        weight = self._TYPE_WEIGHTS.get(transaction_type, 0.08)

        try:
            amount = float(transaction.get("amount") or 0.0)
        except (TypeError, ValueError):
            amount = 0.0

        # Valores altos aumentam o risco em escala logarítmica (satura em 1).
        amount_signal = min(1.0, np.log1p(max(amount, 0.0)) / np.log1p(1_000_000))

        # Conta zerada após a transação é um forte indício de fraude no PaySim.
        drained = 0.0
        new_balance = transaction.get("new_balance_org")
        if new_balance is not None:
            try:
                drained = 0.25 if float(new_balance) <= 0 else 0.0
            except (TypeError, ValueError):
                drained = 0.0

        probability = 0.02 + 0.55 * weight + 0.35 * amount_signal + drained
        return float(min(0.995, max(0.001, probability)))

    def predict(self, transaction: dict) -> dict:
        """Predição heurística determinística."""
        probability = self._probability(transaction)
        return {
            "is_fraud": probability >= DECISION_THRESHOLD,
            "probability": round(probability, 5),
            "model_version": self.version,
            "mode": "mock",
        }

    def predict_batch(self, transactions: list[dict]) -> list[dict]:
        """Predição heurística em lote."""
        return [self.predict(transaction) for transaction in transactions]


__all__ = ["FraudPredictor", "MockFraudPredictor"]
