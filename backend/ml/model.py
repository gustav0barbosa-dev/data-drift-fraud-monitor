"""
Definição do modelo de detecção de fraude (T1.3).

O backend padrão é o **XGBoost**, conforme o PDF. Para manter o projeto
executável em ambientes onde o XGBoost não está disponível, há fallback para o
``HistGradientBoostingClassifier`` do scikit-learn com a mesma interface.

O artefato salvo é um dicionário versionado::

    {
        "artifact_version": 1,
        "model": <estimador treinado>,
        "model_type": "XGBoost",
        "features": [...],
        "type_codes": {...},
        "hyperparameters": {...},
        "metrics": {...},
        "dataset": {...},
        "version": "v1.1.0-xgb",
        "trained_at": "2026-..."
    }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import joblib
import numpy as np
import pandas as pd

from data.preprocess import FEATURES, TYPE_CODES, build_features, ensure_feature_columns

logger = logging.getLogger(__name__)

try:  # pragma: no cover - depende do ambiente
    from xgboost import XGBClassifier

    XGBOOST_AVAILABLE = True
except Exception:  # pragma: no cover
    XGBClassifier = None  # type: ignore[assignment]
    XGBOOST_AVAILABLE = False

from sklearn.ensemble import HistGradientBoostingClassifier

DECISION_THRESHOLD = 0.5
ARTIFACT_VERSION = 1

# Hiperparâmetros do baseline (controle do estudo, conforme o PDF).
DEFAULT_HYPERPARAMETERS: dict[str, Any] = {
    "n_estimators": 300,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.9,
    "colsample_bytree": 0.8,
    "min_child_weight": 1.0,
    "reg_lambda": 1.0,
    "tree_method": "hist",
    "eval_metric": "aucpr",
    "random_state": 42,
    "n_jobs": -1,
}


def backend_name() -> str:
    """Nome do backend efetivamente disponível."""
    return "XGBoost" if XGBOOST_AVAILABLE else "HistGradientBoosting"


def default_model_dir() -> Path:
    """
    Diretório de artefatos.

    Usa ``MODEL_PATH`` quando o caminho é gravável (container: ``/app/models``);
    caso contrário, ``backend/models`` — assim o treino também funciona fora do
    Docker.
    """
    try:
        from db.config import settings

        candidate = Path(settings.MODEL_PATH)
        if candidate.exists() or candidate.parent.exists():
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
    except Exception:
        pass

    fallback = Path(__file__).resolve().parents[1] / "models"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


class FraudModel:
    """Wrapper do estimador com a mesma interface para XGBoost e sklearn."""

    def __init__(
        self,
        hyperparameters: Optional[dict[str, Any]] = None,
        *,
        model_type: Optional[str] = None,
        threshold: float = DECISION_THRESHOLD,
    ) -> None:
        self.hyperparameters = {
            **DEFAULT_HYPERPARAMETERS,
            **(hyperparameters or {}),
        }
        self.model_type = model_type or backend_name()
        self.estimator = self._build_estimator(self.hyperparameters)
        self.features: list[str] = list(FEATURES)
        self.threshold = float(threshold)
        self._fit_frame: Optional[pd.DataFrame] = None
        self._fit_target: Optional[np.ndarray] = None

    # ------------------------------------------------------------------
    # Construção
    # ------------------------------------------------------------------
    @staticmethod
    def _build_estimator(hyperparameters: dict[str, Any]):
        if XGBOOST_AVAILABLE:
            params = {
                key: value
                for key, value in hyperparameters.items()
                if key
                in {
                    "n_estimators",
                    "max_depth",
                    "learning_rate",
                    "subsample",
                    "colsample_bytree",
                    "min_child_weight",
                    "reg_lambda",
                    "tree_method",
                    "eval_metric",
                    "random_state",
                    "n_jobs",
                }
            }
            return XGBClassifier(**params)

        return HistGradientBoostingClassifier(
            max_iter=int(hyperparameters.get("n_estimators", 300)),
            max_depth=hyperparameters.get("max_depth", 6),
            learning_rate=float(hyperparameters.get("learning_rate", 0.05)),
            max_leaf_nodes=31,
            l2_regularization=float(hyperparameters.get("reg_lambda", 1.0)),
            random_state=int(hyperparameters.get("random_state", 42)),
        )

    # ------------------------------------------------------------------
    # Treino / inferência
    # ------------------------------------------------------------------
    def fit(self, X: pd.DataFrame, y: pd.Series) -> "FraudModel":
        """Treina o estimador aplicando ``scale_pos_weight`` para desbalanceio."""
        frame = ensure_feature_columns(X, self.features)
        target = np.asarray(y).astype(int)

        positives = int(target.sum())
        negatives = int(len(target) - positives)
        if positives == 0 or negatives == 0:
            raise ValueError(
                "A base de treino precisa conter as duas classes (fraude e não fraude)"
            )

        if XGBOOST_AVAILABLE:
            # Recalcula o peso das classes a cada treino (o retreino pode ver
            # uma prevalência diferente da do baseline).
            self.estimator.set_params(scale_pos_weight=negatives / positives)
            self.estimator.fit(frame, target)
        else:
            self.estimator.fit(frame, target)

        self._fit_frame = frame
        self._fit_target = target
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Probabilidade da classe fraude (1-D)."""
        if not self.is_fitted():
            raise RuntimeError("Modelo não treinado")
        frame = ensure_feature_columns(X, self.features)
        probabilities = self.estimator.predict_proba(frame)
        probabilities = np.asarray(probabilities)
        if probabilities.ndim == 2:
            probabilities = probabilities[:, 1]
        return np.clip(probabilities, 0.0, 1.0)

    def predict(self, X: pd.DataFrame, threshold: Optional[float] = None) -> np.ndarray:
        """Classificação binária no limiar informado (default: o do artefato)."""
        cutoff = self.threshold if threshold is None else float(threshold)
        return self.predict_proba(X) >= cutoff

    def is_fitted(self) -> bool:
        return hasattr(self.estimator, "classes_") or hasattr(
            self.estimator, "n_features_in_"
        )

    # ------------------------------------------------------------------
    # Importância das features
    # ------------------------------------------------------------------
    def feature_importance(self) -> list[dict[str, float]]:
        """Importância normalizada, ordenada de forma decrescente."""
        importances: Optional[np.ndarray] = None

        if hasattr(self.estimator, "feature_importances_"):
            importances = np.asarray(self.estimator.feature_importances_, dtype=float)

        if importances is None or importances.size == 0:
            importances = self._permutation_importance()

        if importances is None or importances.size == 0:
            importances = np.ones(len(self.features), dtype=float)

        total = float(importances.sum()) or 1.0
        pairs = sorted(
            zip(self.features, importances / total),
            key=lambda item: item[1],
            reverse=True,
        )
        return [
            {"feature": feature, "importance": round(float(value), 4)}
            for feature, value in pairs
        ]

    def _permutation_importance(self) -> Optional[np.ndarray]:  # pragma: no cover
        """Fallback para estimadores sem ``feature_importances_`` (sklearn)."""
        if self._fit_frame is None or self._fit_target is None:
            return None
        try:
            from sklearn.inspection import permutation_importance

            sample = self._fit_frame
            target = self._fit_target
            if len(sample) > 2_000:
                sample = sample.sample(n=2_000, random_state=42)
                target = np.asarray(target)[sample.index]

            result = permutation_importance(
                self.estimator,
                sample,
                target,
                n_repeats=3,
                random_state=42,
                scoring="roc_auc",
            )
            return np.asarray(result.importances_mean, dtype=float)
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Serialização
    # ------------------------------------------------------------------
    def to_artifact(
        self,
        *,
        metadata: Optional[dict[str, Any]] = None,
        version: Optional[str] = None,
    ) -> dict[str, Any]:
        """Monta o dicionário serializável do artefato."""
        payload = dict(metadata or {})
        payload.update(
            {
                "artifact_version": ARTIFACT_VERSION,
                "model": self.estimator,
                "model_type": self.model_type,
                "features": list(self.features),
                "type_codes": dict(TYPE_CODES),
                "hyperparameters": dict(self.hyperparameters),
                "decision_threshold": float(self.threshold),
                "version": version or payload.get("version") or "v1.1.0-xgb",
                "trained_at": payload.get("trained_at")
                or datetime.now(timezone.utc).isoformat(),
            }
        )
        return payload

    @classmethod
    def from_artifact(cls, artifact: dict[str, Any]) -> "FraudModel":
        """Reconstrói o wrapper a partir de um artefato carregado."""
        model = cls(
            hyperparameters=artifact.get("hyperparameters"),
            model_type=artifact.get("model_type"),
            threshold=float(
                artifact.get("decision_threshold", DECISION_THRESHOLD)
            ),
        )
        model.estimator = artifact["model"]
        model.features = list(artifact.get("features") or FEATURES)
        return model


# ----------------------------------------------------------------------
# Persistência
# ----------------------------------------------------------------------
def save_artifact(artifact: dict[str, Any], path: str | Path) -> Path:
    """Salva o artefato (joblib) criando o diretório quando necessário."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, destination)
    logger.info("Artefato salvo em %s", destination)
    return destination


def load_artifact(path: str | Path) -> dict[str, Any]:
    """
    Carrega um artefato.

    Aceita tanto o formato versionado (dicionário) quanto um estimador puro
    salvo por versões anteriores.
    """
    artifact = joblib.load(Path(path))
    if isinstance(artifact, dict) and "model" in artifact:
        artifact.setdefault("features", FEATURES)
        artifact.setdefault("model_type", type(artifact["model"]).__name__)
        return artifact

    return {
        "artifact_version": 0,
        "model": artifact,
        "model_type": type(artifact).__name__,
        "features": FEATURES,
        "hyperparameters": {},
        "version": "legacy",
    }


def prepare_inference_frame(transactions: Sequence[dict] | pd.DataFrame) -> pd.DataFrame:
    """
    Converte transações da API em features do modelo.

    Usa exatamente o mesmo ``build_features`` do treino, evitando skew entre
    treino e serving.
    """
    if isinstance(transactions, pd.DataFrame):
        frame = transactions.copy()
    else:
        frame = pd.DataFrame(list(transactions))

    if frame.empty:
        return pd.DataFrame(columns=FEATURES)

    # A API não envia ``step`` em todos os casos; as features não o usam.
    if "step" not in frame.columns:
        frame["step"] = 0
    if "type" not in frame.columns:
        frame["type"] = "PAYMENT"

    return build_features(frame)


__all__ = [
    "ARTIFACT_VERSION",
    "DECISION_THRESHOLD",
    "DEFAULT_HYPERPARAMETERS",
    "FEATURES",
    "FraudModel",
    "TYPE_CODES",
    "XGBOOST_AVAILABLE",
    "backend_name",
    "default_model_dir",
    "load_artifact",
    "prepare_inference_frame",
    "save_artifact",
]
