"""
Testes da camada de dados da Pessoa 1 (T1.1, T1.2, T1.4 e T1.5).

Cobrem o contrato do PaySim normalizado, a engenharia de features, o split
temporal, o simulador de janelas e os três cenários de drift.
"""
from __future__ import annotations

import pandas as pd
import pytest

from data.drift_simulator import (
    DRIFT_LEVELS,
    apply_drift,
    drift_level_info,
    level_summary,
)
from data.loader import (
    PAYSIM_COLUMNS,
    generate_synthetic_paysim,
    load_paysim,
    resolve_dataset_path,
    standardize_columns,
)
from data.preprocess import (
    FEATURES,
    TYPE_CODES,
    build_features,
    build_labels,
    encode_type,
    prepare_dataset,
    temporal_split,
)
from data.temporal_simulator import (
    TemporalSimulator,
    drifted_stream,
    simulate_passage_of_time,
    windows_frame,
)


# ============================================================
# Loader
# ============================================================
class TestLoader:
    def test_synthetic_is_deterministic(self):
        first = generate_synthetic_paysim(500, seed=7)
        second = generate_synthetic_paysim(500, seed=7)
        pd.testing.assert_frame_equal(first, second)

    def test_synthetic_contract(self):
        frame = generate_synthetic_paysim(1_000, fraud_rate=0.02, seed=11)
        assert list(frame.columns) == PAYSIM_COLUMNS
        assert frame["step"].between(1, 744).all()
        assert set(frame["type"]) <= set(TYPE_CODES)
        assert frame["is_fraud"].dtype == bool
        # A fraude só ocorre em TRANSFER/CASH_OUT.
        assert set(frame.loc[frame["is_fraud"], "type"]) <= {"TRANSFER", "CASH_OUT"}

    def test_synthetic_fraud_rate_is_approx(self):
        frame = generate_synthetic_paysim(5_000, fraud_rate=0.02, seed=3)
        assert 0.01 < frame["is_fraud"].mean() < 0.03

    def test_standardize_camel_case(self):
        raw = pd.DataFrame(
            {
                "step": [1],
                "type": ["transfer"],
                "amount": ["100"],
                "nameOrig": ["C1"],
                "oldbalanceOrg": ["500"],
                "newbalanceOrig": ["400"],
                "nameDest": ["M1"],
                "oldbalanceDest": ["0"],
                "newbalanceDest": ["100"],
                "isFraud": [1],
                "isFlaggedFraud": [0],
            }
        )
        normalized = standardize_columns(raw)
        assert normalized.loc[0, "type"] == "TRANSFER"
        assert normalized.loc[0, "name_orig"] == "C1"
        assert normalized.loc[0, "old_balance_org"] == 500.0
        assert bool(normalized.loc[0, "is_fraud"]) is True

    def test_missing_dataset_without_synthetic_raises(self):
        with pytest.raises(FileNotFoundError):
            load_paysim("caminho/inexistente.csv", allow_synthetic=False)

    def test_missing_dataset_falls_back_to_synthetic(self):
        frame = load_paysim("caminho/inexistente.csv", rows=300, seed=1)
        assert len(frame) == 300
        assert "is_fraud" in frame.columns

    def test_resolve_returns_none_for_missing(self):
        assert resolve_dataset_path("caminho/inexistente.csv") is None


# ============================================================
# Features e split
# ============================================================
class TestPreprocess:
    def test_feature_contract(self):
        assert FEATURES == [
            "amount",
            "old_balance_org",
            "new_balance_org",
            "old_balance_dest",
            "new_balance_dest",
            "balance_diff_org",
            "balance_diff_dest",
            "amount_ratio",
            "type",
        ]
        assert TYPE_CODES["TRANSFER"] == 1
        assert TYPE_CODES["CASH_OUT"] == 2

    def test_build_features_values(self):
        raw = pd.DataFrame(
            {
                "step": [1, 2],
                "type": ["TRANSFER", "PAYMENT"],
                "amount": [200.0, 50.0],
                "old_balance_org": [1_000.0, 500.0],
                "new_balance_org": [800.0, 450.0],
                "old_balance_dest": [0.0, 10.0],
                "new_balance_dest": [200.0, 60.0],
                "is_fraud": [True, False],
            }
        )
        features = build_features(raw)

        assert list(features.columns) == FEATURES
        assert features.loc[0, "balance_diff_org"] == pytest.approx(200.0)
        assert features.loc[0, "balance_diff_dest"] == pytest.approx(200.0)
        assert features.loc[0, "amount_ratio"] == pytest.approx(200.0 / 1001.0)
        assert features.loc[0, "type"] == TYPE_CODES["TRANSFER"]
        assert features.loc[1, "type"] == TYPE_CODES["PAYMENT"]

    def test_encode_unknown_type_is_payment(self):
        encoded = encode_type(pd.Series(["TRANSFER", "DESCONHECIDO"]))
        assert encoded.tolist() == [1.0, 0.0]

    def test_labels(self):
        raw = generate_synthetic_paysim(200, fraud_rate=0.02, seed=2)
        labels = build_labels(raw)
        assert labels.dtype == bool
        assert labels.sum() == raw["is_fraud"].sum()

    def test_temporal_split_preserves_order(self):
        raw = generate_synthetic_paysim(1_000, seed=5)
        train, test = temporal_split(raw, train_ratio=0.7)
        assert len(train) == 700
        assert len(test) == 300
        assert train["step"].max() <= test["step"].min()

    def test_prepare_dataset_shapes(self):
        raw = generate_synthetic_paysim(2_000, fraud_rate=0.02, seed=9)
        split = prepare_dataset(raw, train_ratio=0.75)

        assert split.train_rows == 1_500
        assert split.test_rows == 500
        assert list(split.X_train.columns) == FEATURES
        assert len(split.X_test) == len(split.y_test)
        assert split.train_fraud_rate > 0
        assert split.test_fraud_rate > 0

    def test_invalid_train_ratio(self):
        raw = generate_synthetic_paysim(100, seed=1)
        with pytest.raises(ValueError):
            temporal_split(raw, train_ratio=1.0)


# ============================================================
# Simulador temporal
# ============================================================
@pytest.fixture(scope="module")
def sample_frame() -> pd.DataFrame:
    return generate_synthetic_paysim(1_200, fraud_rate=0.02, seed=13)


class TestTemporalSimulator:
    def test_windows_are_contiguous_and_disjoint(self, sample_frame):
        windows = simulate_passage_of_time(sample_frame, n_windows=6)
        assert len(windows) == 6
        assert sum(window.rows for window in windows) == len(sample_frame)

        for previous, current in zip(windows, windows[1:]):
            assert previous.index + 1 == current.index
            assert previous.end_step <= current.start_step

    def test_window_size_overrides_count(self, sample_frame):
        windows = TemporalSimulator(sample_frame, n_windows=50, window_size=100).windows()
        assert len(windows) == 12
        assert all(window.rows == 100 for window in windows)

    def test_generate_with_drift_and_ramp(self, sample_frame):
        windows = TemporalSimulator(sample_frame, n_windows=5, seed=4).generate(
            level="high", ramp=True, ramp_windows=4
        )
        intensities = [window.drift_intensity for window in windows]

        assert intensities == sorted(intensities)
        assert intensities[0] < intensities[-1]
        assert all(window.drift_level == "high" for window in windows)

    def test_drifted_stream_none_keeps_metrics(self, sample_frame):
        windows = drifted_stream(sample_frame, level="none", n_windows=4)
        combined = windows_frame(windows)
        assert combined["window"].nunique() == 4
        assert combined["is_fraud"].sum() == sample_frame["is_fraud"].sum()


# ============================================================
# Cenários de drift
# ============================================================
@pytest.fixture(scope="module")
def drift_frame() -> pd.DataFrame:
    return generate_synthetic_paysim(4_000, fraud_rate=0.02, seed=17)


class TestDriftSimulator:
    def test_levels_follow_pdf(self):
        assert set(DRIFT_LEVELS) == {"none", "low", "moderate", "high"}
        intensities = [DRIFT_LEVELS[level]["intensity"] for level in DRIFT_LEVELS]
        assert intensities == sorted(intensities)
        assert drift_level_info("moderate")["label"] == "Drift moderado"

    def test_none_is_identity(self, drift_frame):
        drifted = apply_drift(drift_frame, "none", seed=1)
        pd.testing.assert_frame_equal(
            drifted.reset_index(drop=True), drift_frame.reset_index(drop=True)
        )

    def test_amount_grows_with_intensity(self, drift_frame):
        means = [
            apply_drift(drift_frame, level, seed=5)["amount"].mean()
            for level in ("none", "low", "moderate", "high")
        ]
        assert means == sorted(means)

    def test_drift_is_deterministic(self, drift_frame):
        first = apply_drift(drift_frame, "high", seed=8)
        second = apply_drift(drift_frame, "high", seed=8)
        pd.testing.assert_frame_equal(first, second)

    def test_concept_drift_creates_new_typology(self, drift_frame):
        drifted = apply_drift(drift_frame, "high", seed=8)
        # A nova tipologia preserva saldo na origem e usa destino recém-criado.
        new_pattern = (
            drifted["is_fraud"]
            & (drifted["new_balance_org"] > 0)
            & (drifted["old_balance_dest"] == 0)
            & (drifted["new_balance_dest"] > 0)
        )
        assert new_pattern.sum() > 0

    def test_invalid_level_raises(self, drift_frame):
        with pytest.raises(ValueError):
            apply_drift(drift_frame, "extremo")

    def test_level_summary(self):
        summary = level_summary("high", rows=800, seed=2)
        assert summary["intensity"] == DRIFT_LEVELS["high"]["intensity"]
        assert summary["drifted_mean_amount"] > summary["base_mean_amount"]
