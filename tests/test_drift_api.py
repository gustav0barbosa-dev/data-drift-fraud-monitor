"""
Testes dos endpoints de drift que não dependem de banco de dados.
"""
import numpy as np
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from api.exceptions import DriftMonitorException
from api.routes import drift as drift_routes


@pytest.fixture()
def client():
    app = FastAPI()

    @app.exception_handler(DriftMonitorException)
    async def handle_drift_exception(request: Request, exc: DriftMonitorException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.__class__.__name__, "message": exc.message},
        )

    app.include_router(drift_routes.router, prefix="/api/v1/drift")
    return TestClient(app)


class TestDriftEndpoints:
    def test_thresholds(self, client):
        response = client.get("/api/v1/drift/thresholds")
        assert response.status_code == 200
        data = response.json()
        assert data["psi"]["critical"] == 0.25
        assert data["ks"]["direction"] == "below"
        assert data["trigger_severity"] == "critical"

    def test_detect_feature_drift(self, client):
        rng = np.random.default_rng(1)
        payload = {
            "feature_name": "amount",
            "reference": rng.normal(0, 1, 800).tolist(),
            "current": rng.normal(2, 1, 800).tolist(),
        }
        response = client.post("/api/v1/drift/detect/feature", json=payload)
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["feature_name"] == "amount"
        assert data["is_drift"] is True
        assert data["severity"] == "critical"
        assert data["psi"] > 0.25
        assert data["ks_pvalue"] < 0.05
        assert data["methods"]["psi"]["is_drift"] is True
        assert data["methods"]["ks"]["direction"] == "below"

    def test_detect_feature_no_drift(self, client):
        sample = np.random.default_rng(2).normal(0, 1, 500).tolist()
        response = client.post(
            "/api/v1/drift/detect/feature",
            json={"reference": sample, "current": sample},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_drift"] is False
        assert data["severity"] == "none"

    def test_detect_categorical(self, client):
        response = client.post(
            "/api/v1/drift/detect/feature",
            json={
                "feature_name": "type",
                "reference": ["PAYMENT", "TRANSFER", "CASH_IN"] * 100,
                "current": ["PAYMENT", "PAYMENT", "PAYMENT"] * 100,
                "categorical": True,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["categorical"] is True
        assert data["methods"]["ks"]["available"] is False
        assert data["is_drift"] is True

    def test_threshold_override(self, client):
        rng = np.random.default_rng(3)
        payload = {
            "reference": rng.normal(0, 1, 800).tolist(),
            "current": rng.normal(0.5, 1, 800).tolist(),
            "methods": ["psi"],
            "thresholds": {"psi": {"warning": 0.01, "critical": 0.02}},
        }
        response = client.post("/api/v1/drift/detect/feature", json=payload)
        assert response.status_code == 200
        assert response.json()["is_drift"] is True

    def test_invalid_threshold_override(self, client):
        response = client.post(
            "/api/v1/drift/detect/feature",
            json={
                "reference": [1, 2, 3, 4, 5],
                "current": [1, 2, 3, 4, 5],
                "thresholds": {"psi": {"warning": 0.5, "critical": 0.1}},
            },
        )
        assert response.status_code == 400

    def test_invalid_method(self, client):
        response = client.post(
            "/api/v1/drift/detect/feature",
            json={"reference": [1, 2, 3], "current": [1, 2, 3], "methods": ["chi2"]},
        )
        assert response.status_code == 422

    def test_empty_sample_validation(self, client):
        response = client.post(
            "/api/v1/drift/detect/feature",
            json={"reference": [], "current": [1, 2, 3]},
        )
        assert response.status_code == 422

    def test_batch(self, client):
        rng = np.random.default_rng(4)
        payload = {
            "features": [
                {
                    "feature_name": "amount",
                    "reference": rng.normal(0, 1, 500).tolist(),
                    "current": rng.normal(2, 1, 500).tolist(),
                },
                {
                    "feature_name": "type",
                    "reference": ["A", "B"] * 250,
                    "current": ["C"] * 500,
                    "categorical": True,
                },
            ]
        }
        response = client.post("/api/v1/drift/detect/batch", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert len(data["results"]) == 2
        assert data["overall_drift"] is True
        assert set(data["drifted_features"]) == {"amount", "type"}
