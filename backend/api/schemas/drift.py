"""
Schemas Pydantic para detecção de drift.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class DriftMetricBase(BaseModel):
    """Schema base de métrica de drift."""
    feature_name: str = Field(..., description="Nome da feature")
    psi_value: Optional[float] = Field(None, description="Population Stability Index")
    ks_value: Optional[float] = Field(None, description="Estatística KS")
    ks_pvalue: Optional[float] = Field(None, description="P-valor do teste KS")
    js_value: Optional[float] = Field(None, description="Divergência Jensen-Shannon")
    wasserstein_value: Optional[float] = Field(None, description="Distância de Wasserstein")
    threshold: float = Field(..., description="Limiar de alerta")
    is_drift: bool = Field(False, description="Indica se houve drift")


class DriftMetricCreate(DriftMetricBase):
    """Schema para criação de métrica de drift."""
    experiment_id: int
    window_start: datetime
    window_end: datetime


class DriftMetricResponse(DriftMetricBase):
    """Schema de resposta de métrica de drift."""
    id: int
    experiment_id: int
    window_start: datetime
    window_end: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class DriftDetectionRequest(BaseModel):
    """Schema para requisição de detecção de drift."""
    experiment_id: int
    reference_window_start: datetime
    reference_window_end: datetime
    current_window_start: datetime
    current_window_end: datetime
    features: Optional[list[str]] = Field(None, description="Features a analisar (None = todas)")
    methods: list[str] = Field(
        default=["psi", "ks", "js", "wasserstein"],
        description="Métodos de detecção a aplicar"
    )


class DriftDetectionResponse(BaseModel):
    """Schema de resposta de detecção de drift."""
    experiment_id: int
    window_start: datetime
    window_end: datetime
    metrics: list[DriftMetricResponse]
    overall_drift: bool
    max_drift_score: float
    features_with_drift: list[str]