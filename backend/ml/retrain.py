"""
Retreinamento orientado por alertas (T1.7).

Duas camadas:

- ``retrain_model`` — treina uma nova versão a partir de um conjunto de dados
  rotulado já em memória (usada pelo E4 e pelos testes, sem banco);
- ``ModelRetrainer`` — orquestra o retreinamento persistido: coleta os dados,
  treina, registra ``model_versions``/``performance``/``alerts`` e passa a API a
  usar o novo artefato imediatamente.

O gatilho é externo (alerta de drift ou chamada manual em
``POST /api/v1/retrain/``); o módulo não decide sozinho quando retreinar, o que
mantém o experimento E4 no controle do desenho experimental.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import pandas as pd

from data.drift_simulator import DriftLevel, apply_drift
from data.loader import load_paysim, standardize_columns
from data.preprocess import FEATURES, build_features, build_labels, temporal_split
from ml.metrics import classification_metrics, find_best_threshold
from ml.model import (
    FraudModel,
    default_model_dir,
    save_artifact,
)
from ml.train import _build_metadata, _version_label

logger = logging.getLogger(__name__)

# Mínimo de transações rotuladas para treinar sem complementar com o dataset.
MIN_DB_ROWS = 200
# Linhas usadas quando é preciso complementar com o dataset base.
DEFAULT_FALLBACK_ROWS = 20_000

VERSION_PATTERN = re.compile(r"^v(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)")


@dataclass
class RetrainResult:
    """Resultado de um retreinamento (em memória)."""

    model: FraudModel
    metrics: dict[str, Any]
    feature_importance: list[dict[str, float]]
    metadata: dict[str, Any]
    rows_used: int
    fraud_rate: float
    model_path: Optional[Path] = None

    @property
    def version(self) -> str:
        return str(self.metadata["version"])

    def summary(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "model_path": str(self.model_path) if self.model_path else None,
            "rows_used": self.rows_used,
            "fraud_rate": round(self.fraud_rate, 6),
            "metrics": self.metrics,
            "feature_importance": self.feature_importance,
        }


# ----------------------------------------------------------------------
# Versões
# ----------------------------------------------------------------------
def next_version(versions: Sequence[str]) -> str:
    """Calcula a próxima versão (``v1.1.0-xgb`` → ``v1.2.0-xgb``)."""
    minors = [
        int(match.group("minor"))
        for version in versions
        if (match := VERSION_PATTERN.match(str(version)))
    ]
    base = max(minors, default=1) + 1
    return _version_label(f"v1.{base}.0")


# ----------------------------------------------------------------------
# Treino em memória
# ----------------------------------------------------------------------
def retrain_model(
    data: pd.DataFrame,
    *,
    version: str = "v1.2.0",
    hyperparameters: Optional[dict[str, Any]] = None,
    train_ratio: float = 0.7,
    output_path: Optional[str | Path] = None,
    save: bool = True,
    seed: int = 42,
) -> RetrainResult:
    """
    Treina uma nova versão a partir de transações rotuladas.

    O split é temporal (as transações mais recentes viram teste), reproduzindo
    a validação usada no baseline.
    """
    frame = standardize_columns(data)
    if frame.empty:
        raise ValueError("Dados de retreinamento vazios")

    labels = build_labels(frame)
    if labels.nunique() < 2:
        raise ValueError(
            "Dados de retreinamento precisam conter fraudes e não fraudes"
        )

    train, test = temporal_split(frame, train_ratio=train_ratio)
    if len(train) < 20 or len(test) < 5:
        raise ValueError("Dados insuficientes para retreinar (mínimo 20 treino / 5 teste)")

    X_train, y_train = build_features(train), build_labels(train)
    X_test, y_test = build_features(test), build_labels(test)

    if y_train.nunique() < 2:
        raise ValueError("Split de treino sem as duas classes")

    model = FraudModel(hyperparameters)
    model.fit(X_train, y_train)

    train_metrics = classification_metrics(y_train, model.predict_proba(X_train))
    test_scores = model.predict_proba(X_test)
    test_metrics = classification_metrics(y_test, test_scores)

    # Recalibração do limiar: sob drift a prevalência e a separabilidade mudam,
    # então o limiar de 0,5 do baseline pode não ser mais adequado. O limiar é
    # escolhido na validação temporal e passa a valer para o novo artefato.
    best_threshold = find_best_threshold(y_test, test_scores)
    chosen_threshold = min(0.8, max(0.10, float(best_threshold["threshold"])))
    model.threshold = chosen_threshold
    if chosen_threshold != 0.5:
        test_metrics = classification_metrics(
            y_test, test_scores, threshold=chosen_threshold
        )
    test_metrics["best_threshold"] = best_threshold
    test_metrics["decision_threshold"] = chosen_threshold

    importance = model.feature_importance()

    dataset = {
        "name": "Dados de retreinamento",
        "rows": int(len(frame)),
        "fraud_rate": float(labels.mean()),
        "fraud_count": int(labels.sum()),
        "step_min": int(frame["step"].min()),
        "step_max": int(frame["step"].max()),
    }
    split = _SplitView(len(train), len(test), y_train.mean(), y_test.mean(), int(train["step"].max()))

    label = _version_label(version)
    metadata = _build_metadata(
        version=label,
        model=model,
        split=split,  # type: ignore[arg-type]
        dataset=dataset,
        train_metrics=train_metrics,
        test_metrics=test_metrics,
        feature_importance=importance,
    )

    model_path: Optional[Path] = None
    if save:
        destination = (
            Path(output_path)
            if output_path is not None
            else default_model_dir() / f"{label}.joblib"
        )
        model_path = save_artifact(
            model.to_artifact(metadata=metadata, version=label), destination
        )

    logger.info(
        "Retreino %s concluído | %s linhas | F1=%.4f",
        label,
        len(frame),
        test_metrics["f1"] or 0.0,
    )

    return RetrainResult(
        model=model,
        metrics=test_metrics,
        feature_importance=importance,
        metadata=metadata,
        rows_used=int(len(frame)),
        fraud_rate=float(labels.mean()),
        model_path=model_path,
    )


@dataclass(frozen=True)
class _SplitView:
    """Compatibiliza o resumo do split com ``_build_metadata``."""

    train_rows: int
    test_rows: int
    train_fraud_rate: float
    test_fraud_rate: float
    split_step: int

    def summary(self) -> dict[str, Any]:
        return {
            "train_rows": self.train_rows,
            "test_rows": self.test_rows,
            "train_fraud_rate": round(float(self.train_fraud_rate), 6),
            "test_fraud_rate": round(float(self.test_fraud_rate), 6),
            "split_step": int(self.split_step),
        }


def retrain_from_windows(
    windows: Sequence[pd.DataFrame],
    *,
    version: str = "v1.2.0",
    output_path: Optional[str | Path] = None,
    save: bool = False,
    hyperparameters: Optional[dict[str, Any]] = None,
) -> RetrainResult:
    """Retreina a partir das janelas recentes (usado pelo E4)."""
    if not windows:
        raise ValueError("Nenhuma janela para retreinar")
    data = pd.concat([window for window in windows if len(window) > 0], ignore_index=True)
    return retrain_model(
        data,
        version=version,
        output_path=output_path,
        save=save,
        hyperparameters=hyperparameters,
    )


# ----------------------------------------------------------------------
# Orquestração com banco (API)
# ----------------------------------------------------------------------
class ModelRetrainer:
    """Retreinamento persistido, acionado por alerta ou manualmente."""

    def __init__(self, db) -> None:
        self.db = db

    # ------------------------------------------------------------------
    def retrain(
        self,
        experiment_id: int,
        *,
        reason: str = "alert",
        triggered_by: str = "api",
        rows: Optional[int] = None,
        train_ratio: float = 0.7,
    ) -> dict[str, Any]:
        """
        Retreina o modelo do experimento e o promove a ativo.

        Raises:
            ValueError: experimento inexistente ou dados insuficientes.
        """
        from db.models import Experiment, ModelVersion, Performance

        experiment = (
            self.db.query(Experiment).filter(Experiment.id == experiment_id).first()
        )
        if experiment is None:
            raise ValueError(f"Experimento {experiment_id} não encontrado")

        versions = (
            self.db.query(ModelVersion)
            .filter(ModelVersion.experiment_id == experiment_id)
            .all()
        )
        version = next_version([item.version for item in versions])

        data, source = self._collect_training_data(
            experiment_id,
            drift_level=experiment.drift_level,
            rows=rows,
        )

        result = retrain_model(
            data,
            version=version,
            train_ratio=train_ratio,
            save=True,
        )

        metrics = result.metrics
        now = datetime.now(timezone.utc)

        model_version = ModelVersion(
            experiment_id=experiment_id,
            version=result.version,
            model_path=str(result.model_path),
            model_type=result.model.model_type,
            hyperparameters=result.metadata.get("hyperparameters", {}),
            training_metrics=result.metadata.get("training_metrics", {}),
            is_active=True,
        )
        self.db.add(model_version)
        self.db.flush()

        performance = Performance(
            model_version_id=model_version.id,
            window_start=now - timedelta(hours=1),
            window_end=now,
            accuracy=metrics.get("accuracy"),
            precision=metrics.get("precision"),
            recall=metrics.get("recall"),
            f1_score=metrics.get("f1"),
            auc_roc=metrics.get("auc_roc"),
            total_predictions=metrics.get("total", 0),
            true_positives=metrics.get("true_positives", 0),
            false_positives=metrics.get("false_positives", 0),
            true_negatives=metrics.get("true_negatives", 0),
            false_negatives=metrics.get("false_negatives", 0),
        )
        self.db.add(performance)

        from db.models import Alert

        alert = Alert(
            experiment_id=experiment_id,
            model_version_id=model_version.id,
            alert_type="retrain_completed",
            severity="info",
            message=(
                f"Retreinamento concluído ({reason}): {result.version} "
                f"F1={metrics.get('f1')}"
            ),
            metadata_json={
                "version": result.version,
                "reason": reason,
                "triggered_by": triggered_by,
                "source": source,
                "rows_used": result.rows_used,
                "metrics": metrics,
            },
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(model_version)

        self._activate(model_version)

        return {
            "experiment_id": experiment_id,
            "model_version_id": model_version.id,
            "version": result.version,
            "model_path": str(result.model_path),
            "source": source,
            "rows_used": result.rows_used,
            "metrics": metrics,
            "reason": reason,
            "triggered_by": triggered_by,
        }

    # ------------------------------------------------------------------
    def _collect_training_data(
        self,
        experiment_id: int,
        *,
        drift_level: DriftLevel,
        rows: Optional[int] = None,
    ) -> tuple[pd.DataFrame, str]:
        """
        Coleta os dados de retreinamento.

        Preferência: predições reais do experimento (com rótulo verdadeiro da
        transação). Se não houver volume suficiente, usa o PaySim (real ou
        sintético) com o nível de drift do experimento aplicado — assim o novo
        modelo aprende a distribuição atual, e não a de referência.
        """
        db_frame = self._predictions_frame(experiment_id, limit=rows)
        if len(db_frame) >= MIN_DB_ROWS and db_frame["is_fraud"].nunique() > 1:
            return db_frame, "database"

        fallback_rows = rows or DEFAULT_FALLBACK_ROWS
        base = load_paysim(rows=fallback_rows)
        drifted = apply_drift(base, drift_level) if drift_level != "none" else base
        return drifted, "dataset"

    def _predictions_frame(self, experiment_id: int, *, limit: Optional[int]) -> pd.DataFrame:
        """Transações já pontuadas por modelos do experimento (com rótulo real)."""
        from db.models import ModelVersion, Prediction, Transaction

        query = (
            self.db.query(Transaction)
            .join(Prediction, Prediction.transaction_id == Transaction.id)
            .join(ModelVersion, ModelVersion.id == Prediction.model_version_id)
            .filter(ModelVersion.experiment_id == experiment_id)
            .order_by(Transaction.step.asc())
        )
        if limit:
            query = query.limit(limit)

        transactions = query.all()
        records = [
            {
                "step": item.step,
                "type": item.type,
                "amount": float(item.amount or 0.0),
                "old_balance_org": float(item.old_balance_org or 0.0),
                "new_balance_org": float(item.new_balance_org or 0.0),
                "old_balance_dest": float(item.old_balance_dest or 0.0),
                "new_balance_dest": float(item.new_balance_dest or 0.0),
                "is_fraud": bool(item.is_fraud),
                "is_flagged_fraud": bool(item.is_flagged_fraud),
            }
            for item in transactions
        ]
        return pd.DataFrame(records)

    # ------------------------------------------------------------------
    @staticmethod
    def _activate(model_version) -> None:
        """Recarrega o artefato recém-promovido no estado da aplicação."""
        try:
            from api.main import app_state
            from ml.predict import FraudPredictor

            predictor = FraudPredictor(model_version.model_path)
            app_state.predictor = predictor
            app_state.active_model_version = model_version
            logger.info(
                "API usando o novo modelo %s (%s)",
                model_version.version,
                model_version.model_path,
            )
        except Exception as exc:  # pragma: no cover - melhor esforço
            logger.warning("Não foi possível recarregar o modelo na API: %s", exc)


def alert_triggers_retraining(alert: dict[str, Any] | Any) -> bool:
    """
    Regra de negócio: alerta crítico de drift/performance pede retreinamento.

    Recebe um dicionário ou objeto com ``alert_type``/``severity``.
    """
    def _get(key: str):
        if isinstance(alert, dict):
            return alert.get(key)
        return getattr(alert, key, None)

    alert_type = _get("alert_type") or _get("type")
    severity = _get("severity")
    return (
        severity == "critical"
        and alert_type in {"drift_detected", "performance_degradation", "threshold_exceeded"}
    )


__all__ = [
    "MIN_DB_ROWS",
    "ModelRetrainer",
    "RetrainResult",
    "alert_triggers_retraining",
    "next_version",
    "retrain_from_windows",
    "retrain_model",
]
