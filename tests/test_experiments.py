"""
Testes da análise estatística (T2.8) e do experimento E3 (T2.6).
"""
import json

import numpy as np
import pytest

from experiments.e3_detection_methods import (
    build_markdown_report,
    evaluate_windows,
    run_experiment,
    save_results,
)
from experiments.statistical_analysis import (
    bootstrap_auc_ci,
    bootstrap_ci,
    classification_metrics,
    cohens_kappa,
    mcnemar_test,
    paired_comparison,
    roc_auc,
    wilson_ci,
)


# ============================================================
# Estatística
# ============================================================
class TestStatisticalAnalysis:
    def test_wilson_ci(self):
        lower, upper = wilson_ci(50, 100)
        assert 0.40 < lower < 0.50
        assert 0.50 < upper < 0.60
        assert wilson_ci(0, 0) == (0.0, 0.0)

    def test_wilson_extremes(self):
        lower, upper = wilson_ci(0, 100)
        assert lower == 0.0
        assert 0 < upper < 0.05

    def test_bootstrap_ci(self):
        result = bootstrap_ci(np.arange(100), n_boot=200)
        assert result["lower"] < result["estimate"] < result["upper"]
        assert result["estimate"] == pytest.approx(49.5)

    def test_auc_perfect(self):
        assert roc_auc([False, False, True, True], [0.1, 0.2, 0.8, 0.9]) == 1.0

    def test_auc_reversed(self):
        assert roc_auc([False, False, True, True], [0.9, 0.8, 0.2, 0.1]) == 0.0

    def test_auc_ties_and_single_class(self):
        assert roc_auc([True, False], [0.5, 0.5]) == 0.5
        assert roc_auc([True, True], [0.1, 0.9]) is None

    def test_bootstrap_auc(self):
        result = bootstrap_auc_ci(
            [False] * 50 + [True] * 50,
            list(np.linspace(0, 0.49, 50)) + list(np.linspace(0.51, 1, 50)),
            n_boot=100,
        )
        assert result["estimate"] == 1.0
        assert result["lower"] <= result["upper"]

    def test_classification_metrics(self):
        metrics = classification_metrics(
            [True, True, False, False], [True, False, True, False]
        )
        assert metrics["tp"] == 1
        assert metrics["fp"] == 1
        assert metrics["fn"] == 1
        assert metrics["tn"] == 1
        assert metrics["sensitivity"] == 0.5
        assert metrics["specificity"] == 0.5
        assert metrics["f1"] == 0.5

    def test_mcnemar_no_discordance(self):
        result = mcnemar_test([True, True, False], [True, True, False])
        assert result["p_value"] == 1.0
        assert result["method"] == "none"

    def test_mcnemar_detects_difference(self):
        a = [True] * 40 + [False] * 10
        b = [False] * 40 + [False] * 10
        result = mcnemar_test(a, b)
        assert result["p_value"] < 0.001
        assert result["b"] == 40
        assert result["c"] == 0

    def test_kappa(self):
        assert cohens_kappa([True, False, True], [True, False, True]) == 1.0
        assert cohens_kappa([True, False, True], [False, True, False]) < 0

    def test_paired_comparison(self):
        labels = [True, False] * 100
        decisions = {
            "a": [True, False] * 100,
            "b": [False, False] * 100,
        }
        result = paired_comparison(decisions, labels, n_boot=50)
        assert "a_vs_b" in result
        assert result["a_vs_b"]["accuracy_difference"] == 0.5
        assert result["a_vs_b"]["mcnemar"]["p_value"] < 0.001


# ============================================================
# E3
# ============================================================
@pytest.fixture(scope="class")
def e3_results():
    return run_experiment(
        repetitions=12,
        latency_repetitions=4,
        n_reference=300,
        n_current=150,
        window_size=120,
        max_windows=6,
        seed=7,
    )


class TestE3:
    def test_structure(self, e3_results):
        results = e3_results
        assert results["experiment"].startswith("E3")
        assert set(results["performance"]) == {"none", "low", "moderate", "high"}
        assert set(results["pooled"]) == {"psi", "ks", "js", "wasserstein"}
        assert set(results["latency"]) == {"low", "moderate", "high"}
        assert len(results["pairwise"]) == 6

    def test_detection_rates(self, e3_results):
        results = e3_results
        for scenario in results["performance"].values():
            for data in scenario["methods"].values():
                assert 0 <= data["detection_rate"] <= 1
                assert data["ci_lower"] <= data["detection_rate"] <= data["ci_upper"]

    def test_strong_drift_is_detected(self, e3_results):
        results = e3_results
        for method, data in results["performance"]["high"]["methods"].items():
            assert data["detection_rate"] == 1.0, method

    def test_auc_values(self, e3_results):
        results = e3_results
        for data in results["pooled"].values():
            assert data["auc"] is None or 0 <= data["auc"] <= 1

    def test_latency_curve(self, e3_results):
        results = e3_results
        for scenario in results["latency"].values():
            for data in scenario["methods"].values():
                assert len(data["detection_curve"]) == 6
                assert data["detection_curve"] == sorted(data["detection_curve"])
                assert 0 <= data["detection_rate"] <= 1

    def test_report(self, e3_results):
        report = build_markdown_report(e3_results)
        assert "# Relatório E3" in report
        assert "Sensibilidade e especificidade" in report
        assert "Limitações" in report

    def test_save_results(self, e3_results, tmp_path):
        paths = save_results(e3_results, tmp_path)
        assert paths["json"].exists()
        assert paths["performance_csv"].exists()
        assert paths["latency_csv"].exists()
        assert paths["report"].exists()

        loaded = json.loads(paths["json"].read_text(encoding="utf-8"))
        assert loaded["experiment"].startswith("E3")
        # JSON não pode conter NaN/Infinity (não é JSON estrito).
        json.loads(paths["json"].read_text(encoding="utf-8"), parse_constant=_reject)

    def test_invalid_config(self):
        with pytest.raises(ValueError):
            run_experiment(repetitions=1)

    def test_evaluate_windows(self):
        rng = np.random.default_rng(99)
        reference = rng.normal(0, 1, 500)
        windows = [rng.normal(0, 1, 200), rng.normal(1, 1, 200)]
        result = evaluate_windows(reference, windows)
        assert result["reference_size"] == 500
        assert len(result["windows"]) == 2
        assert result["windows"][0]["window"] == 1
        assert result["windows"][1]["is_drift"] is True


def _reject(value):
    raise AssertionError(f"Valor não estrito em JSON: {value}")
