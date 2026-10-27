"""
Testes reduzidos dos experimentos da Pessoa 1 (E1, E2 e E4).

Os experimentos completos rodam com dezenas de milhares de transações; aqui as
amostras são reduzidas para manter a suíte rápida, mas mantendo o mesmo
contrato de saída (JSON, CSVs e relatório Markdown).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from experiments import e1_no_drift, e2_drift_levels, e4_retraining
from data.loader import generate_synthetic_paysim


@pytest.fixture(scope="module")
def synthetic_csv(tmp_path_factory) -> Path:
    """CSV próprio do teste: evita depender do PaySim/sample local."""
    path = tmp_path_factory.mktemp("data") / "paysim.csv"
    generate_synthetic_paysim(6_000, fraud_rate=0.05, seed=123).to_csv(
        path, index=False
    )
    return path


@pytest.fixture(scope="module")
def e1_results(tmp_path_factory, synthetic_csv) -> dict:
    output = tmp_path_factory.mktemp("e1")
    return e1_no_drift.run_experiment(
        rows=2_000,
        n_windows=3,
        dataset_path=synthetic_csv,
        seed=42,
        save_model=False,
        output_dir=output,
    )


@pytest.fixture(scope="module")
def e2_results(tmp_path_factory, synthetic_csv) -> dict:
    output = tmp_path_factory.mktemp("e2")
    return e2_drift_levels.run_experiment(
        rows=3_000,
        n_windows=3,
        dataset_path=synthetic_csv,
        seed=42,
        reference_sample=500,
        output_dir=output,
    )


@pytest.fixture(scope="module")
def e4_results(tmp_path_factory, synthetic_csv) -> dict:
    output = tmp_path_factory.mktemp("e4")
    return e4_retraining.run_experiment(
        rows=4_000,
        n_windows=6,
        train_ratio=0.5,
        level="high",
        ramp_windows=2,
        dataset_path=synthetic_csv,
        seed=42,
        cooldown=1,
        window_buffer=2,
        alert_psi=0.10,
        reference_sample=500,
        output_dir=output,
    )


# ============================================================
# E1
# ============================================================
class TestE1:
    def test_structure(self, e1_results):
        assert e1_results["experiment"] == "E1"
        assert e1_results["split"]["train_rows"] > 0
        assert len(e1_results["windows"]) == 3
        assert e1_results["aggregate"]["f1"] is not None

    def test_metrics_are_reasonable(self, e1_results):
        # Sem drift o modelo mantém AUC alto e F1 acima do acaso.
        assert e1_results["aggregate"]["auc_roc"] > 0.8
        assert e1_results["aggregate"]["f1"] > 0.4

    def test_artifacts(self, e1_results):
        artifacts = e1_results["artifacts"]
        for key in ("json", "windows", "report"):
            assert Path(artifacts[key]).exists()

        report = Path(artifacts["report"]).read_text(encoding="utf-8")
        assert "# E1" in report
        assert "Estabilidade" in report

        payload = json.loads(Path(artifacts["json"]).read_text(encoding="utf-8"))
        assert payload["experiment"] == "E1"


# ============================================================
# E2
# ============================================================
class TestE2:
    def test_all_scenarios_present(self, e2_results):
        assert set(e2_results["scenarios"]) == {"none", "low", "moderate", "high"}
        assert len(e2_results["summary"]) == 4

    def test_drift_causes_degradation(self, e2_results):
        scenarios = e2_results["scenarios"]
        control = scenarios["none"]["aggregate"]["f1"]
        strong = scenarios["high"]["aggregate"]["f1"]
        assert strong < control

    def test_drift_is_detected(self, e2_results):
        scenarios = e2_results["scenarios"]
        assert scenarios["high"]["drift"]["max_psi"] > scenarios["none"]["drift"]["max_psi"]
        assert scenarios["high"]["drift"]["detected_windows"] >= 1

    def test_artifacts(self, e2_results):
        artifacts = e2_results["artifacts"]
        for key in ("json", "windows", "summary", "report"):
            assert Path(artifacts[key]).exists()

        report = Path(artifacts["report"]).read_text(encoding="utf-8")
        assert "# E2" in report
        assert "Degradação" in report


# ============================================================
# E4
# ============================================================
class TestE4:
    def test_policies_are_measured(self, e4_results):
        assert e4_results["experiment"] == "E4"
        assert len(e4_results["policies"]["no_retrain"]["windows"]) == 6
        assert len(e4_results["policies"]["alert_retrain"]["windows"]) == 6

    def test_alert_triggers_retraining(self, e4_results):
        assert e4_results["summary"]["drift_alerts"] >= 1
        assert len(e4_results["policies"]["alert_retrain"]["retrains"]) >= 1

    def test_retraining_improves_tail(self, e4_results):
        static = e4_results["policies"]["no_retrain"]["tail"]["f1"]
        alert = e4_results["policies"]["alert_retrain"]["tail"]["f1"]
        assert static is not None and alert is not None
        assert alert >= static

    def test_artifacts(self, e4_results):
        artifacts = e4_results["artifacts"]
        for key in ("json", "windows", "retrains", "report"):
            assert Path(artifacts[key]).exists()

        report = Path(artifacts["report"]).read_text(encoding="utf-8")
        assert "# E4" in report
        assert "Retreinamento" in report
