"""
Treinamento do modelo baseline (T1.3).

Executa o pipeline completo: carregamento → features → split temporal →
treino (XGBoost) → avaliação → persistência do artefato e dos metadados.

Uso::

    cd backend
    python -m ml.train --rows 60000
    python -m ml.train --dataset ../data/paysim.csv --rows 200000

O artefato é salvo em ``MODEL_PATH`` (container) ou ``backend/models`` e pode
ser carregado pela API via ``ml.predict.FraudPredictor``.
"""
from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import pandas as pd

from data.loader import dataset_info as summarize_dataset
from data.loader import load_paysim, standardize_columns
from data.preprocess import (
    FEATURES,
    DatasetSplit,
    build_features,
    build_labels,
    prepare_dataset,
)
from ml.metrics import classification_metrics, find_best_threshold
from ml.model import (
    FraudModel,
    backend_name,
    default_model_dir,
    save_artifact,
)

logger = logging.getLogger(__name__)

DEFAULT_VERSION = "v1.1.0"
DEFAULT_ROWS = 60_000


@dataclass
class TrainResult:
    """Resultado do treino do baseline."""

    model: FraudModel
    split: DatasetSplit
    train_metrics: dict[str, Any]
    test_metrics: dict[str, Any]
    feature_importance: list[dict[str, float]]
    dataset: dict[str, Any]
    metadata: dict[str, Any]
    model_path: Optional[Path] = None

    @property
    def version(self) -> str:
        return str(self.metadata.get("version"))

    def summary(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "model_type": self.metadata.get("model_type"),
            "model_path": str(self.model_path) if self.model_path else None,
            "dataset": self.dataset,
            "split": self.split.summary(),
            "train_metrics": self.train_metrics,
            "test_metrics": self.test_metrics,
            "feature_importance": self.feature_importance,
        }


def _version_label(version: str) -> str:
    """Acrescenta o sufixo do backend (ex.: ``v1.1.0-xgb``)."""
    if version.endswith("-xgb") or version.endswith("-skl"):
        return version
    return f"{version}-{'xgb' if backend_name() == 'XGBoost' else 'skl'}"


def _build_metadata(
    *,
    version: str,
    model: FraudModel,
    split: DatasetSplit,
    dataset: dict[str, Any],
    train_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    feature_importance: list[dict[str, float]],
) -> dict[str, Any]:
    training_metrics = {
        **test_metrics,
        "dataset": dataset.get("name", "PaySim"),
        "samples": dataset.get("rows"),
        "features": len(FEATURES),
        "fraud_rate": dataset.get("fraud_rate"),
        "feature_importance": feature_importance,
        "train": train_metrics,
        "test": test_metrics,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "version": version,
        "model_type": model.model_type,
        "features": list(FEATURES),
        "hyperparameters": dict(model.hyperparameters),
        "training_metrics": training_metrics,
        "dataset": dataset,
        "split": split.summary(),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def train_baseline(
    df: Optional[pd.DataFrame] = None,
    *,
    dataset_path: Optional[str | Path] = None,
    rows: Optional[int] = DEFAULT_ROWS,
    fraud_rate: float = 0.005,
    train_ratio: float = 0.7,
    hyperparameters: Optional[dict[str, Any]] = None,
    version: str = DEFAULT_VERSION,
    output_path: Optional[str | Path] = None,
    seed: int = 42,
    save: bool = True,
    eval_frame: Optional[pd.DataFrame] = None,
) -> TrainResult:
    """
    Treina o modelo baseline e avalia no conjunto de teste temporal.

    Args:
        df: dataset já carregado (opcional).
        dataset_path: CSV do PaySim (default: resolução automática).
        rows: limite de linhas lidas/geradas.
        fraud_rate: taxa de fraude do gerador sintético.
        train_ratio: fração temporal de treino.
        hyperparameters: sobrescreve os hiperparâmetros do baseline.
        version: versão do artefato (``v1.1.0`` → ``v1.1.0-xgb``).
        output_path: caminho do artefato; ``None`` usa o diretório padrão.
        seed: semente do gerador/amostragem.
        save: quando ``False``, não grava o artefato (usado em testes).
        eval_frame: quando informado, treina em todo o ``df`` e avalia neste
            conjunto (usado pelos experimentos E1/E2/E4). O split interno de
            ``train_ratio`` só é aplicado quando ``eval_frame`` é ``None``.
    """
    if df is None:
        df = load_paysim(
            dataset_path,
            rows=rows,
            seed=seed,
            fraud_rate=fraud_rate,
        )

    dataset = summarize_dataset(df)
    dataset["name"] = "PaySim (sintético)" if dataset_path is None else Path(dataset_path).name

    if eval_frame is not None:
        train = standardize_columns(df)
        test = standardize_columns(eval_frame)
        X_train, y_train = build_features(train), build_labels(train)
        X_test, y_test = build_features(test), build_labels(test)
        split = DatasetSplit(
            X_train=X_train,
            y_train=y_train,
            X_test=X_test,
            y_test=y_test,
            train_rows=len(train),
            test_rows=len(test),
            train_fraud_rate=float(y_train.mean()),
            test_fraud_rate=float(y_test.mean()),
            split_step=int(train["step"].max()),
        )
    else:
        split = prepare_dataset(df, train_ratio=train_ratio)

    model = FraudModel(hyperparameters)
    model.fit(split.X_train, split.y_train)

    train_scores = model.predict_proba(split.X_train)
    test_scores = model.predict_proba(split.X_test)
    train_metrics = classification_metrics(split.y_train, train_scores)
    test_metrics = classification_metrics(split.y_test, test_scores)

    feature_importance = model.feature_importance()

    label = _version_label(version)
    metadata = _build_metadata(
        version=label,
        model=model,
        split=split,
        dataset=dataset,
        train_metrics=train_metrics,
        test_metrics=test_metrics,
        feature_importance=feature_importance,
    )

    model_path: Optional[Path] = None
    if save:
        destination = (
            Path(output_path)
            if output_path is not None
            else default_model_dir() / f"{label}.joblib"
        )
        artifact = model.to_artifact(metadata=metadata, version=label)
        model_path = save_artifact(artifact, destination)

    logger.info(
        "Baseline %s treinado | F1=%.4f AUC=%.4f PR-AUC=%.4f",
        label,
        test_metrics["f1"] or 0.0,
        test_metrics["auc_roc"] or 0.0,
        test_metrics["pr_auc"] or 0.0,
    )

    return TrainResult(
        model=model,
        split=split,
        train_metrics=train_metrics,
        test_metrics=test_metrics,
        feature_importance=feature_importance,
        dataset=dataset,
        metadata=metadata,
        model_path=model_path,
    )


def evaluate_model(
    model: FraudModel,
    df: pd.DataFrame,
    *,
    threshold: float = 0.5,
) -> dict[str, Any]:
    """Avalia um modelo já treinado em um DataFrame rotulado."""
    from data.preprocess import build_features, build_labels

    features = build_features(df)
    labels = build_labels(df)
    scores = model.predict_proba(features)
    metrics = classification_metrics(labels, scores, threshold=threshold)
    metrics["best_threshold"] = find_best_threshold(labels, scores)
    return metrics


def register_model_version(
    db,
    result: TrainResult,
    *,
    experiment_id: int = 1,
    activate: bool = True,
):
    """
    Persiste o resultado do treino em ``model_versions`` e o promove a ativo.

    Usado por ``python -m ml.train --register`` para que a API carregue o
    baseline no startup (sem depender de um retreinamento prévio).
    """
    from db.models import ModelVersion

    if result.model_path is None:
        raise ValueError("Treine com save=True antes de registrar o modelo")

    if activate:
        db.query(ModelVersion).filter(
            ModelVersion.experiment_id == experiment_id,
            ModelVersion.is_active.is_(True),
        ).update({ModelVersion.is_active: False}, synchronize_session=False)

    version = ModelVersion(
        experiment_id=experiment_id,
        version=result.version,
        model_path=str(result.model_path),
        model_type=result.metadata.get("model_type", result.model.model_type),
        hyperparameters=result.metadata.get("hyperparameters", {}),
        training_metrics=result.metadata.get("training_metrics", {}),
        is_active=activate,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Treina o modelo baseline de detecção de fraude (XGBoost)."
    )
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--fraud-rate", type=float, default=0.005)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--version", type=str, default=DEFAULT_VERSION)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--n-estimators", type=int, default=None)
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--learning-rate", type=float, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--register",
        action="store_true",
        help="Registra o modelo em model_versions e o promove a ativo (requer banco).",
    )
    parser.add_argument("--experiment-id", type=int, default=1)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    hyperparameters: dict[str, Any] = {}
    if args.n_estimators is not None:
        hyperparameters["n_estimators"] = args.n_estimators
    if args.max_depth is not None:
        hyperparameters["max_depth"] = args.max_depth
    if args.learning_rate is not None:
        hyperparameters["learning_rate"] = args.learning_rate

    result = train_baseline(
        dataset_path=args.dataset,
        rows=args.rows,
        fraud_rate=args.fraud_rate,
        train_ratio=args.train_ratio,
        hyperparameters=hyperparameters or None,
        version=args.version,
        output_path=args.output,
        seed=args.seed,
    )

    print(f"[OK] Modelo {result.version} treinado ({backend_name()})")
    print(f"     dataset: {result.dataset['rows']} transações")
    print(f"     artefato: {result.model_path}")
    print(
        "     teste: "
        f"F1={result.test_metrics['f1']:.4f} "
        f"AUC={result.test_metrics['auc_roc'] or 0:.4f} "
        f"PR-AUC={result.test_metrics['pr_auc'] or 0:.4f}"
    )

    if args.register:
        from db.database import SessionLocal

        db = SessionLocal()
        try:
            version = register_model_version(
                db, result, experiment_id=args.experiment_id
            )
            print(
                f"     registrado: model_version_id={version.id} "
                f"(experimento {args.experiment_id}, ativo={version.is_active})"
            )
        except Exception as exc:  # noqa: BLE001 - CLI informa e segue
            print(f"     [AVISO] não foi possível registrar no banco: {exc}")
        finally:
            db.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
