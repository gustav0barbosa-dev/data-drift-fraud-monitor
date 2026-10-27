"""
Testes do núcleo de ML da Pessoa 1 (T1.3, T1.6, T1.7 e T1.8).

Usam uma amostra sintética pequena com taxa de fraude elevada para manter a
suíte rápida, sem depender do PaySim real nem de banco de dados.
"""
from __future__ import annotations

from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from data.loader import generate_synthetic_paysim
from data.preprocess import FEATURES, build_features, temporal_split
from ml.metrics import (
    aggregate_metrics,
    classification_metrics,
    degradation,
    find_best_threshold,
    metrics_frame,
)
from ml.model import (
    FraudModel,
    load_artifact,
    prepare_inference_frame,
    save_artifact,
)
from ml.predict import FraudPredictor, MockFraudPredictor
from ml.retrain import (
    alert_triggers_retraining,
    next_version,
    retrain_model,
)
from ml.train import evaluate_model, register_model_version, train_baseline

FAST_HYPERPARAMETERS = {
    "n_estimators": 40,
    "max_depth": 3,
    "learning_rate": 0.15,
}


@pytest.fixture(scope="module")
def dataset() -> pd.DataFrame:
    return generate_synthetic_paysim(4_000, fraud_rate=0.03, seed=21)


@pytest.fixture(scope="module")
def baseline(dataset):
    return train_baseline(
        dataset,
        rows=len(dataset),
        hyperparameters=FAST_HYPERPARAMETERS,
        save=False,
    )


# ============================================================
# Métricas
# ============================================================
class TestMetrics:
    def test_perfect_classification(self):
        metrics = classification_metrics([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])

        assert metrics["accuracy"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0
        assert metrics["f1"] == 1.0
        assert metrics["auc_roc"] == 1.0
        assert metrics["true_positives"] == 2

    def test_threshold_changes_confusion(self):
        labels = [0, 0, 1, 1]
        scores = [0.2, 0.6, 0.4, 0.9]

        low = classification_metrics(labels, scores, threshold=0.3)
        high = classification_metrics(labels, scores, threshold=0.7)
        assert low["recall"] >= high["recall"]
        assert low["false_positives"] >= high["false_positives"]

    def test_empty_input(self):
        metrics = classification_metrics([], [])
        assert metrics["total"] == 0
        assert metrics["f1"] is None

    def test_aggregate_and_degradation(self):
        windows = [
            {"metrics": {"precision": 0.9, "recall": 0.9, "f1": 0.9, "accuracy": 0.95, "auc_roc": 0.95, "pr_auc": 0.9}},
            {"metrics": {"precision": 0.7, "recall": 0.7, "f1": 0.7, "accuracy": 0.85, "auc_roc": 0.85, "pr_auc": 0.7}},
        ]
        aggregate = aggregate_metrics(windows)
        assert aggregate["f1"] == pytest.approx(0.8)
        assert aggregate["windows"] == 2

        delta = degradation(windows[0]["metrics"], windows[1]["metrics"])
        assert delta["f1"]["absolute"] == pytest.approx(-0.2)

    def test_find_best_threshold(self):
        labels = [0] * 80 + [1] * 20
        scores = np.linspace(0, 1, 100)
        best = find_best_threshold(labels, scores)
        assert 0.05 <= best["threshold"] <= 0.95
        assert 0 <= best["f1"] <= 1

    def test_metrics_frame(self):
        records = [
            {
                "label": "W01",
                "start_step": 1,
                "end_step": 10,
                "rows": 10,
                "drift_level": "none",
                "drift_intensity": 0.0,
                "metrics": classification_metrics([0, 1], [0.1, 0.9]),
            }
        ]
        frame = metrics_frame(records)
        assert frame.loc[0, "window"] == "W01"
        assert frame.loc[0, "f1"] == 1.0


# ============================================================
# Modelo e artefato
# ============================================================
class TestFraudModel:
    def test_baseline_trains_and_predicts(self, baseline):
        assert baseline.model.is_fitted()
        assert baseline.test_metrics["f1"] > 0.5
        assert baseline.test_metrics["auc_roc"] > 0.8
        assert baseline.version.startswith("v1.1.0")

    def test_probabilities_are_bounded(self, baseline, dataset):
        _, test = temporal_split(dataset, train_ratio=0.7)
        scores = baseline.model.predict_proba(build_features(test))
        assert scores.shape[0] == len(test)
        assert np.all((scores >= 0) & (scores <= 1))

    def test_feature_importance_is_normalized(self, baseline):
        importance = baseline.feature_importance
        assert {item["feature"] for item in importance} == set(FEATURES)
        assert sum(item["importance"] for item in importance) == pytest.approx(1.0, abs=0.01)

    def test_artifact_roundtrip(self, baseline, tmp_path):
        path = tmp_path / "model.joblib"
        save_artifact(
            baseline.model.to_artifact(metadata=baseline.metadata, version="v9.9.9-xgb"),
            path,
        )

        artifact = load_artifact(path)
        assert artifact["artifact_version"] == 1
        assert artifact["version"] == "v9.9.9-xgb"
        assert artifact["features"] == FEATURES

        restored = FraudModel.from_artifact(artifact)
        original = baseline.model.predict_proba(baseline.split.X_test)
        reloaded = restored.predict_proba(baseline.split.X_test)
        assert np.allclose(original, reloaded)

    def test_legacy_artifact_is_accepted(self, baseline, tmp_path):
        import joblib

        path = tmp_path / "legacy.joblib"
        joblib.dump(baseline.model.estimator, path)

        artifact = load_artifact(path)
        assert artifact["artifact_version"] == 0
        assert artifact["version"] == "legacy"
        assert artifact["features"] == FEATURES

    def test_prepare_inference_frame_accepts_api_payload(self):
        payload = {
            "step": 1,
            "type": "TRANSFER",
            "amount": Decimal("150.00"),
            "old_balance_org": Decimal("500.00"),
            "new_balance_org": Decimal("350.00"),
            "old_balance_dest": Decimal("0.00"),
            "new_balance_dest": Decimal("150.00"),
        }
        frame = prepare_inference_frame([payload])
        assert list(frame.columns) == FEATURES
        assert frame.loc[0, "type"] == 1.0
        assert frame.loc[0, "balance_diff_org"] == pytest.approx(150.0)

    def test_prepare_inference_frame_empty(self):
        frame = prepare_inference_frame([])
        assert list(frame.columns) == FEATURES
        assert frame.empty


# ============================================================
# Preditor da API
# ============================================================
class TestFraudPredictor:
    def test_loads_versioned_artifact(self, baseline, tmp_path):
        path = tmp_path / "model.joblib"
        save_artifact(
            baseline.model.to_artifact(metadata=baseline.metadata, version="v1.1.0-xgb"),
            path,
        )

        predictor = FraudPredictor(str(path))
        assert predictor.is_loaded()
        assert predictor.version == "v1.1.0-xgb"

        result = predictor.predict(
            {
                "step": 1,
                "type": "TRANSFER",
                "amount": 250_000,
                "old_balance_org": 250_000,
                "new_balance_org": 0,
                "old_balance_dest": 0,
                "new_balance_dest": 0,
            }
        )
        assert set(result) >= {"is_fraud", "probability", "model_version"}
        assert 0 <= result["probability"] <= 1

    def test_batch(self, baseline, tmp_path):
        path = tmp_path / "model.joblib"
        save_artifact(
            baseline.model.to_artifact(metadata=baseline.metadata, version="v1.1.0-xgb"),
            path,
        )
        predictor = FraudPredictor(str(path))
        results = predictor.predict_batch(
            [
                {"type": "PAYMENT", "amount": 10, "old_balance_org": 100, "new_balance_org": 90},
                {"type": "TRANSFER", "amount": 500, "old_balance_org": 500, "new_balance_org": 0},
            ]
        )
        assert len(results) == 2
        assert predictor.predict_batch([]) == []

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            FraudPredictor("nao/existe.joblib")

    def test_mock_predictor(self):
        predictor = MockFraudPredictor()
        high = predictor.predict(
            {"type": "TRANSFER", "amount": 250_000, "new_balance_org": 0}
        )
        low = predictor.predict(
            {"type": "PAYMENT", "amount": 20, "new_balance_org": 4_000}
        )
        assert high["probability"] > low["probability"]
        assert high["mode"] == "mock"


# ============================================================
# Retreinamento
# ============================================================
class TestRetraining:
    def test_next_version(self):
        assert next_version(["v1.1.0-xgb"]) == "v1.2.0-xgb"
        assert next_version(["v1.1.0-xgb", "v1.4.0-xgb"]) == "v1.5.0-xgb"
        assert next_version([]) == "v1.2.0-xgb"

    def test_retrain_updates_version_and_threshold(self, dataset):
        drifted = generate_synthetic_paysim(3_000, fraud_rate=0.03, seed=33)
        result = retrain_model(
            drifted,
            version="v1.2.0",
            hyperparameters=FAST_HYPERPARAMETERS,
            save=False,
        )
        assert result.version.endswith("-xgb")
        assert 0.1 <= result.model.threshold <= 0.8
        assert result.rows_used == 3_000
        assert result.metrics["f1"] is not None

    def test_retrain_rejects_single_class(self, dataset):
        single = dataset[~dataset["is_fraud"]].head(500)
        with pytest.raises(ValueError):
            retrain_model(single, save=False)

    def test_alert_trigger_rule(self):
        assert alert_triggers_retraining(
            {"alert_type": "drift_detected", "severity": "critical"}
        )
        assert alert_triggers_retraining(
            {"alert_type": "performance_degradation", "severity": "critical"}
        )
        assert not alert_triggers_retraining(
            {"alert_type": "drift_detected", "severity": "info"}
        )
        assert not alert_triggers_retraining(
            {"alert_type": "retrain_completed", "severity": "critical"}
        )

    def test_evaluate_model(self, baseline, dataset):
        _, test = temporal_split(dataset, train_ratio=0.7)
        metrics = evaluate_model(baseline.model, test)
        assert metrics["total"] == len(test)
        assert "best_threshold" in metrics

    def test_register_model_version(self, dataset, tmp_path):
        result = train_baseline(
            dataset,
            rows=len(dataset),
            hyperparameters=FAST_HYPERPARAMETERS,
            save=True,
            output_path=tmp_path / "v1.1.0-xgb.joblib",
        )

        class _FakeQuery:
            def __init__(self):
                self.updated = False

            def filter(self, *args, **kwargs):
                return self

            def update(self, *args, **kwargs):
                self.updated = True

        class _FakeDB:
            def __init__(self):
                self.query_result = _FakeQuery()
                self.added = []

            def query(self, model):
                return self.query_result

            def add(self, obj):
                obj.id = 1
                self.added.append(obj)

            def commit(self):
                pass

            def refresh(self, obj):
                pass

        fake_db = _FakeDB()
        version = register_model_version(fake_db, result, experiment_id=7)

        assert version.experiment_id == 7
        assert version.version == result.version
        assert version.model_path.endswith("v1.1.0-xgb.joblib")
        assert version.is_active is True
        assert fake_db.query_result.updated is True
        assert len(fake_db.added) == 1

    def test_register_requires_saved_artifact(self, dataset):
        result = train_baseline(
            dataset,
            rows=len(dataset),
            hyperparameters=FAST_HYPERPARAMETERS,
            save=False,
        )
        with pytest.raises(ValueError):
            register_model_version(object(), result)
