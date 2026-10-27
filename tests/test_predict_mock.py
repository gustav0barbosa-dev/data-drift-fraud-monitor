"""
Testes do preditor heurístico (fallback sem artefato treinado).

Não dependem de banco de dados: garantem que a API continua funcional antes do
pipeline de treinamento (Pessoa 1) disponibilizar um modelo.
"""
import pytest
from fastapi.testclient import TestClient

from api.main import app
from ml.predict import MockFraudPredictor

client = TestClient(app)


@pytest.fixture(scope="module")
def predictor() -> MockFraudPredictor:
    return MockFraudPredictor()


LOW_RISK = {
    "step": 1,
    "type": "PAYMENT",
    "amount": 25.0,
    "old_balance_org": 5000.0,
    "new_balance_org": 4975.0,
}

HIGH_RISK = {
    "step": 1,
    "type": "TRANSFER",
    "amount": 250000.0,
    "old_balance_org": 250000.0,
    "new_balance_org": 0.0,
}


def test_mock_predictor_is_always_loaded(predictor):
    assert predictor.is_loaded() is True
    assert predictor.mode == "mock"


def test_mock_prediction_is_deterministic(predictor):
    first = predictor.predict(HIGH_RISK)
    second = predictor.predict(HIGH_RISK)
    assert first == second
    assert first["mode"] == "mock"


def test_mock_probability_within_bounds(predictor):
    for transaction in (LOW_RISK, HIGH_RISK):
        probability = predictor.predict(transaction)["probability"]
        assert 0.0 <= probability <= 1.0


def test_mock_ranks_high_risk_above_low_risk(predictor):
    low = predictor.predict(LOW_RISK)["probability"]
    high = predictor.predict(HIGH_RISK)["probability"]
    assert high > low


def test_mock_batch_matches_single(predictor):
    batch = predictor.predict_batch([LOW_RISK, HIGH_RISK])
    assert batch == [predictor.predict(LOW_RISK), predictor.predict(HIGH_RISK)]


def test_predict_health_reports_mode():
    response = client.get("/api/v1/predict/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["mode"] in {"mock", "model"}


def test_prediction_validation_rejects_invalid_payload():
    response = client.post("/api/v1/predict/", json={"step": -1, "type": "INVALID", "amount": -100})
    assert response.status_code == 422
