"""
Testes unitários dos métodos estatísticos e do detector de drift (Pessoa 2).
"""
import numpy as np
import pandas as pd
import pytest

from drift.alert_system import AlertSystem, build_drift_alerts
from drift.detector import DriftDetector
from drift.js_divergence import (
    calculate_js,
    calculate_js_categorical,
    calculate_js_divergence,
)
from drift.ks_test import calculate_ks, calculate_ks_detailed
from drift.psi import (
    calculate_psi,
    calculate_psi_categorical,
    interpret_psi,
    psi_components,
)
from drift.thresholds import (
    DEFAULT_THRESHOLDS,
    DriftThresholds,
    Threshold,
)
from drift.wasserstein import (
    calculate_wasserstein,
    calculate_wasserstein_normalized,
)


# ============================================================
# PSI
# ============================================================
class TestPSI:
    def test_identical_samples_near_zero(self):
        rng = np.random.default_rng(1)
        sample = rng.normal(0, 1, 5000)
        assert calculate_psi(sample, sample) == pytest.approx(0.0, abs=1e-8)

    def test_same_distribution_is_low(self):
        rng = np.random.default_rng(2)
        reference = rng.normal(0, 1, 5000)
        current = rng.normal(0, 1, 5000)
        assert calculate_psi(reference, current) < 0.02

    def test_shifted_distribution_is_high(self):
        rng = np.random.default_rng(3)
        reference = rng.normal(0, 1, 5000)
        current = rng.normal(1.5, 1, 5000)
        assert calculate_psi(reference, current) > 0.25

    def test_current_outside_reference_range_is_counted(self):
        """Regressão: valores fora das bordas da referência não podem ser ignorados."""
        reference = np.linspace(0, 1, 1000)
        current = np.full(1000, 100.0)
        assert calculate_psi(reference, current) > 5

    def test_constant_samples(self):
        assert calculate_psi(np.full(100, 5.0), np.full(100, 5.0)) == pytest.approx(0.0)
        assert calculate_psi(np.full(100, 5.0), np.full(100, 6.0)) > 1.0

    def test_categorical(self):
        reference = ["A", "B", "A", "A", "B", "C"] * 50
        assert calculate_psi_categorical(reference, reference) == pytest.approx(0.0)
        current = ["C"] * 300
        assert calculate_psi_categorical(reference, current) > 0.25

    def test_categorical_unseen_category(self):
        reference = ["A", "A", "B", "B"] * 50
        current = ["A", "B", "C", "C"] * 50
        assert calculate_psi_categorical(reference, current) > 0.1

    def test_invalid_inputs(self):
        with pytest.raises(ValueError):
            calculate_psi([], [1, 2, 3])
        with pytest.raises(ValueError):
            calculate_psi([1, 2, 3], [1, 2, 3], bins=1)
        with pytest.raises(TypeError):
            calculate_psi(["a", "b"], ["a", "b"])

    def test_interpretation(self):
        assert interpret_psi(0.05) == "stable"
        assert interpret_psi(0.15) == "moderate"
        assert interpret_psi(0.30) == "significant"

    def test_components_sum_to_psi(self):
        rng = np.random.default_rng(4)
        components = psi_components(rng.normal(0, 1, 1000), rng.normal(0.5, 1, 1000))
        assert sum(components["contributions"]) == pytest.approx(components["psi"])
        assert len(components["bin_edges"]) == len(components["contributions"]) + 1


# ============================================================
# Kolmogorov-Smirnov
# ============================================================
class TestKS:
    def test_same_sample(self):
        rng = np.random.default_rng(5)
        sample = rng.normal(0, 1, 2000)
        statistic, pvalue = calculate_ks(sample, sample)
        assert statistic == pytest.approx(0.0)
        assert pvalue == pytest.approx(1.0)

    def test_shifted_distribution(self):
        rng = np.random.default_rng(6)
        statistic, pvalue = calculate_ks(
            rng.normal(0, 1, 1000), rng.normal(1, 1, 1000)
        )
        assert 0 < statistic <= 1
        assert pvalue < 0.001

    def test_detailed(self):
        rng = np.random.default_rng(7)
        result = calculate_ks_detailed(
            rng.normal(0, 1, 500), rng.normal(2, 1, 500)
        )
        assert result["is_drift"] is True
        assert result["effect_size"] == "large"
        assert 0 <= result["p_value"] <= 1

    def test_disjoint_constants(self):
        statistic, pvalue = calculate_ks(np.zeros(100), np.ones(100))
        assert statistic == 1.0
        assert pvalue < 0.001

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            calculate_ks([], [1, 2, 3])


# ============================================================
# Jensen-Shannon
# ============================================================
class TestJensenShannon:
    def test_same_sample(self):
        rng = np.random.default_rng(8)
        sample = rng.normal(0, 1, 2000)
        assert calculate_js(sample, sample) == pytest.approx(0.0, abs=1e-12)

    def test_shifted_distribution(self):
        rng = np.random.default_rng(9)
        value = calculate_js(rng.normal(0, 1, 2000), rng.normal(1.5, 1, 2000))
        assert value > 0.4

    def test_divergence_is_squared_distance(self):
        rng = np.random.default_rng(10)
        reference, current = rng.normal(0, 1, 500), rng.normal(0.4, 1, 500)
        distance = calculate_js(reference, current, base=2)
        divergence = calculate_js_divergence(reference, current, base=2)
        assert divergence == pytest.approx(distance**2)

    def test_bias_correction_reduces_null_noise(self):
        rng = np.random.default_rng(11)
        raw = []
        corrected = []
        for _ in range(100):
            reference = rng.normal(0, 1, 300)
            current = rng.normal(0, 1, 150)
            raw.append(calculate_js(reference, current))
            corrected.append(calculate_js(reference, current, bias_correction=True))
        assert np.mean(corrected) < np.mean(raw) / 2

    def test_disjoint_constants(self):
        value = calculate_js(np.zeros(100), np.ones(100))
        assert value == pytest.approx(np.sqrt(np.log(2)), rel=1e-3)

    def test_categorical(self):
        reference = ["A", "B"] * 100
        assert calculate_js_categorical(reference, reference) == pytest.approx(0.0)
        assert calculate_js_categorical(reference, ["C"] * 200) > 0.5

    def test_non_numeric_raises(self):
        with pytest.raises(TypeError):
            calculate_js(["A", "B"], ["A", "B"])


# ============================================================
# Wasserstein
# ============================================================
class TestWasserstein:
    def test_same_sample(self):
        rng = np.random.default_rng(12)
        sample = rng.normal(0, 1, 1000)
        assert calculate_wasserstein(sample, sample) == pytest.approx(0.0)
        assert calculate_wasserstein_normalized(sample, sample) == pytest.approx(0.0)

    def test_shifted_distribution(self):
        rng = np.random.default_rng(13)
        reference = rng.normal(0, 1, 2000)
        current = rng.normal(1, 1, 2000)
        assert calculate_wasserstein(reference, current) == pytest.approx(1.0, abs=0.1)
        assert calculate_wasserstein_normalized(reference, current) == pytest.approx(
            1.0, abs=0.1
        )

    def test_scale_invariance_of_normalized_metric(self):
        rng = np.random.default_rng(14)
        reference = rng.normal(0, 10, 2000)
        current = rng.normal(10, 10, 2000)
        normalized = calculate_wasserstein_normalized(reference, current)
        assert normalized == pytest.approx(1.0, abs=0.1)

    def test_iqr_scale(self):
        rng = np.random.default_rng(15)
        value = calculate_wasserstein_normalized(
            rng.normal(0, 1, 1000), rng.normal(1, 1, 1000), method="iqr"
        )
        assert value > 0

    def test_constant_reference_is_finite(self):
        value = calculate_wasserstein_normalized(np.full(10, 5.0), np.full(10, 6.0))
        assert np.isfinite(value)
        assert value > 0

    def test_invalid_scale_method(self):
        with pytest.raises(ValueError):
            calculate_wasserstein_normalized([1, 2, 3], [1, 2, 3], method="bad")  # type: ignore[arg-type]


# ============================================================
# Limiares
# ============================================================
class TestThresholds:
    def test_above(self):
        threshold = Threshold(0.1, 0.25, "above")
        assert threshold.classify(0.05) == "none"
        assert threshold.classify(0.1) == "warning"
        assert threshold.classify(0.25) == "critical"
        assert threshold.classify(None) == "none"

    def test_below(self):
        threshold = Threshold(0.10, 0.05, "below")
        assert threshold.classify(0.5) == "none"
        assert threshold.classify(0.07) == "warning"
        assert threshold.classify(0.01) == "critical"

    def test_invalid_threshold(self):
        with pytest.raises(ValueError):
            Threshold(0.5, 0.1, "above")
        with pytest.raises(ValueError):
            Threshold(0.1, 0.5, "below")

    def test_from_dict_partial(self):
        thresholds = DriftThresholds.from_dict(
            {"psi": {"critical": 0.2}, "trigger_severity": "warning"}
        )
        assert thresholds.psi.critical == 0.2
        assert thresholds.psi.warning == 0.1
        assert thresholds.trigger_severity == "warning"
        assert thresholds.is_drift("warning") is True

    def test_defaults_are_consistent(self):
        assert DEFAULT_THRESHOLDS.psi.critical == 0.25
        assert DEFAULT_THRESHOLDS.ks.critical == 0.05
        assert DEFAULT_THRESHOLDS.ks.direction == "below"
        assert DEFAULT_THRESHOLDS.trigger_severity == "critical"


# ============================================================
# Detector
# ============================================================
class TestDriftDetector:
    def setup_method(self):
        self.detector = DriftDetector()
        self.rng = np.random.default_rng(42)

    def test_no_drift(self):
        sample = self.rng.normal(0, 1, 1000)
        result = self.detector.detect(sample, sample, feature_name="amount")
        assert result["feature_name"] == "amount"
        assert result["is_drift"] is False
        assert result["severity"] == "none"
        assert result["psi"] == pytest.approx(0.0, abs=1e-8)
        assert result["n_reference"] == 1000

    def test_strong_drift(self):
        result = self.detector.detect(
            self.rng.normal(0, 1, 2000), self.rng.normal(1.5, 1.5, 2000)
        )
        assert result["is_drift"] is True
        assert result["severity"] == "critical"
        assert result["psi"] > 0.25
        assert result["ks_pvalue"] < 0.05
        assert result["js"] > 0.1
        assert result["wasserstein_normalized"] > 0.25
        assert result["drift_score"] > 0

    def test_method_subset(self):
        result = self.detector.detect(
            self.rng.normal(0, 1, 500),
            self.rng.normal(1, 1, 500),
            methods=["psi"],
        )
        assert set(result["methods"]) == {"psi"}
        assert result["ks_stat"] is None
        assert result["js"] is None

    def test_categorical(self):
        result = self.detector.detect(
            ["A", "B", "A", "B"] * 100,
            ["C", "C", "C", "C"] * 100,
            feature_name="type",
        )
        assert result["categorical"] is True
        assert result["methods"]["psi"]["available"] is True
        assert result["methods"]["ks"]["available"] is False
        assert result["is_drift"] is True

    def test_insufficient_data_does_not_trigger(self):
        result = self.detector.detect(
            ["A"] * 10 + ["B"] * 10,
            ["C"] * 20,
            categorical=True,
        )
        assert result["insufficient_data"] is True
        assert result["is_drift"] is False
        assert result["severity"] == "critical"  # magnitude, mas sem alerta
        assert any("insuficiente" in w for w in result["warnings"])

    def test_nan_is_ignored(self):
        reference = np.concatenate([self.rng.normal(0, 1, 500), [np.nan, np.inf]])
        current = np.concatenate([self.rng.normal(0, 1, 500), [np.nan]])
        result = self.detector.detect(reference, current)
        assert result["n_reference"] == 500
        assert result["n_current"] == 500
        assert np.isfinite(result["psi"])

    def test_detect_frame(self):
        reference = pd.DataFrame(
            {
                "id": range(500),
                "amount": self.rng.normal(0, 1, 500),
                "type": self.rng.choice(["A", "B"], 500),
                "is_fraud": self.rng.integers(0, 2, 500),
            }
        )
        current = pd.DataFrame(
            {
                "id": range(500, 1000),
                "amount": self.rng.normal(1.5, 1, 500),
                "type": self.rng.choice(["C"], 500),
                "is_fraud": self.rng.integers(0, 2, 500),
            }
        )
        result = self.detector.detect_frame(
            reference, current, exclude=["id", "is_fraud"]
        )
        assert "amount" in result["features"]
        assert "type" in result["features"]
        assert "id" not in result["features"]
        assert result["overall_drift"] is True
        assert set(result["drifted_features"]) == {"amount", "type"}
        assert result["max_severity"] == "critical"

    def test_forced_categorical_numeric_codes(self):
        result = self.detector.detect(
            [1, 1, 2, 2] * 100,
            [1, 2, 3, 3] * 100,
            categorical=True,
        )
        assert result["categorical"] is True
        assert result["methods"]["wasserstein"]["available"] is False

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            self.detector.detect([], [1, 2, 3])


# ============================================================
# Sistema de alertas (camada pura)
# ============================================================
class TestAlertSystem:
    def _drift_result(self):
        detector = DriftDetector()
        rng = np.random.default_rng(21)
        result = detector.detect(rng.normal(0, 1, 1000), rng.normal(2, 2, 1000))
        return {"features": {"amount": result}}

    def test_build_alert(self):
        alerts = build_drift_alerts(1, self._drift_result())
        assert len(alerts) == 1
        alert = alerts[0]
        assert alert.alert_type == "drift_detected"
        assert alert.severity == "critical"
        assert "amount" in alert.metadata["features"]
        assert alert.metadata["per_feature"]["amount"]["psi"] > 0

    def test_build_alert_from_single_result(self):
        result = self._drift_result()["features"]["amount"]
        result["feature_name"] = "amount"
        alerts = build_drift_alerts(1, result)
        assert len(alerts) == 1
        assert alerts[0].metadata["features"] == ["amount"]

    def test_no_alert_without_drift(self):
        sample = np.random.default_rng(22).normal(0, 1, 500)
        result = DriftDetector().detect(sample, sample)
        alerts = build_drift_alerts(1, {"features": {"x": result}})
        assert alerts == []

    def test_warning_alert(self):
        result = {
            "features": {
                "x": {
                    "severity": "warning",
                    "is_drift": False,
                    "drift_score": 0.12,
                    "psi": 0.12,
                }
            }
        }
        alerts = build_drift_alerts(1, result)
        assert len(alerts) == 1
        assert alerts[0].severity == "warning"
        assert "moderado" in alerts[0].message

    def test_feature_alerts(self):
        alerts = build_drift_alerts(1, self._drift_result(), include_feature_alerts=True)
        assert len(alerts) == 2
        assert alerts[1].message.startswith("Drift crítico")

    def test_insufficient_data_is_skipped(self):
        result = {
            "features": {
                "x": {
                    "severity": "critical",
                    "is_drift": False,
                    "insufficient_data": True,
                    "drift_score": 1.0,
                }
            }
        }
        assert build_drift_alerts(1, result) == []

    def test_alert_system_without_db(self):
        system = AlertSystem(db=None)
        alerts = system.evaluate(1, self._drift_result())
        assert len(alerts) == 1

        processed = system.process(1, self._drift_result())
        assert processed["persisted"] is False
        assert processed["created"] == 0
        assert len(processed["alerts"]) == 1

    def test_create_alert_requires_db(self):
        with pytest.raises(RuntimeError):
            AlertSystem(db=None).create_drift_alert(1, ["x"], 0.3)
