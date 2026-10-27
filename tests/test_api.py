"""
Testes automatizados da API.
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


# ============================================================
# Health
# ============================================================
def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert "components" in response.json()


def test_ping():
    response = client.get("/ping")
    assert response.status_code == 200
    assert response.json()["message"] == "pong"


# ============================================================
# Experimentos
# ============================================================
@pytest.mark.db
def test_create_experiment():
    payload = {
        "name": "Teste Pytest",
        "description": "Experimento criado em teste",
        "drift_level": "low",
        "config": {"test": True}
    }
    response = client.post("/api/v1/experiments/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["drift_level"] == payload["drift_level"]
    return data["id"]


@pytest.mark.db
def test_create_duplicate_experiment():
    payload = {
        "name": "Duplicado",
        "drift_level": "none"
    }
    client.post("/api/v1/experiments/", json=payload)
    response = client.post("/api/v1/experiments/", json=payload)
    assert response.status_code == 409


@pytest.mark.db
def test_list_experiments():
    response = client.get("/api/v1/experiments/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.db
def test_get_experiment_not_found():
    response = client.get("/api/v1/experiments/99999")
    assert response.status_code == 404


# ============================================================
# Predição
# ============================================================
@pytest.mark.db
def test_predict_single():
    payload = {
        "step": 1,
        "type": "TRANSFER",
        "amount": 5000.00,
        "old_balance_org": 10000.00,
        "new_balance_org": 5000.00,
        "is_fraud": False,
        "is_flagged_fraud": False
    }
    response = client.post("/api/v1/predict/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "is_fraud" in data
    assert "probability" in data
    assert 0 <= float(data["probability"]) <= 1


@pytest.mark.db
def test_predict_batch():
    payload = {
        "transactions": [
            {"step": 1, "type": "PAYMENT", "amount": 100.00},
            {"step": 2, "type": "TRANSFER", "amount": 200.00}
        ]
    }
    response = client.post("/api/v1/predict/batch", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["total"] == 2


def test_predict_validation_error():
    payload = {"step": -1, "type": "INVALID", "amount": -100}
    response = client.post("/api/v1/predict/", json=payload)
    assert response.status_code == 422