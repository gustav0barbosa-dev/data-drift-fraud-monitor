# backend/api/schemas/drift.py
"""
Schemas Pydantic para drift e alertas.
"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["none", "warning", "critical"]
MethodName = Literal["psi", "ks", "js", "wasserstein"]
Direction = Literal["above", "below"]


# ============================================================
# Resultados por método
# ============================================================
class MethodResult(BaseModel):
    """Resultado de um método estatístico para uma feature."""

    available: bool = Field(True, description="Método aplicável à feature")
    value: Optional[float] = Field(
        None, description="Valor usado na decisão (p-valor para KS)"
    )
    statistic: Optional[float] = Field(
        None, description="Estatística bruta (D para KS, distância bruta para Wasserstein)"
    )
    raw_value: Optional[float] = Field(
        None, description="Valor bruto (Wasserstein sem normalização)"
    )
    threshold: Optional[float] = Field(None, description="Limiar crítico")
    warning_threshold: Optional[float] = Field(None, description="Limiar de atenção")
    direction: Optional[Direction] = Field(
        None, description="Sentido do limiar ('above' ou 'below')"
    )
    severity: Severity = Field("none", description="Severidade classificada")
    is_drift: bool = Field(False, description="Drift confirmado no limiar crítico")
    reason: Optional[str] = Field(None, description="Motivo de indisponibilidade")


class FeatureDriftResponse(BaseModel):
    """Resultado de drift de uma feature."""

    feature_name: Optional[str] = None
    n_reference: int
    n_current: int
    categorical: bool = False
    insufficient_data: bool = False

    methods: dict[str, MethodResult] = Field(default_factory=dict)

    psi: Optional[float] = Field(None, ge=0)
    ks_stat: Optional[float] = Field(None, ge=0, le=1)
    ks_pvalue: Optional[float] = Field(None, ge=0, le=1)
    js: Optional[float] = Field(None, ge=0, le=1)
    wasserstein: Optional[float] = Field(None, ge=0)
    wasserstein_normalized: Optional[float] = Field(None, ge=0)

    severity: Severity = "none"
    is_drift: bool = False
    drift_score: float = Field(0.0, ge=0)
    warnings: list[str] = Field(default_factory=list)


# ============================================================
# Requisições sem banco (úteis para E3, dashboard e testes)
# ============================================================
class FeatureDriftRequest(BaseModel):
    """Detecção de drift a partir de duas listas de valores."""

    feature_name: Optional[str] = Field(None, max_length=255)
    reference: list[float | str] = Field(
        ..., min_length=2, description="Valores de referência"
    )
    current: list[float | str] = Field(
        ..., min_length=2, description="Valores atuais"
    )
    methods: list[MethodName] = Field(
        default_factory=lambda: ["psi", "ks", "js", "wasserstein"]
    )
    categorical: Optional[bool] = Field(
        None, description="Força tratamento categórico; None = inferir"
    )
    thresholds: Optional[dict[str, Any]] = Field(
        None,
        description="Sobrescreve parcialmente os limiares (ver GET /drift/thresholds)",
    )

    @field_validator("methods")
    @classmethod
    def methods_must_not_be_empty(cls, value: list[MethodName]) -> list[MethodName]:
        if not value:
            raise ValueError("Informe ao menos um método")
        return value


class FeatureDriftBatchRequest(BaseModel):
    """Lote de detecções de drift sem banco."""

    features: list[FeatureDriftRequest] = Field(..., min_length=1, max_length=200)


class FeatureDriftBatchResponse(BaseModel):
    """Resultado agregado de um lote de features."""

    results: list[FeatureDriftResponse]
    overall_drift: bool
    max_severity: Severity = "none"
    max_drift_score: float = 0.0
    drifted_features: list[str] = Field(default_factory=list)


# ============================================================
# Requisição com janelas do banco
# ============================================================
class DriftDetectionRequest(BaseModel):
    """Requisição de detecção de drift entre janelas temporais."""

    experiment_id: int
    reference_window_start: datetime
    reference_window_end: datetime
    current_window_start: datetime
    current_window_end: datetime
    features: Optional[list[str]] = Field(None, description="Features a analisar")
    methods: list[MethodName] = Field(
        default_factory=lambda: ["psi", "ks", "js", "wasserstein"]
    )
    feature_types: Optional[dict[str, Literal["numeric", "categorical"]]] = Field(
        None, description="Força o tipo de features específicas"
    )
    thresholds: Optional[dict[str, Any]] = Field(
        None, description="Sobrescreve parcialmente os limiares"
    )

    @field_validator("methods")
    @classmethod
    def methods_must_not_be_empty(cls, value: list[MethodName]) -> list[MethodName]:
        if not value:
            raise ValueError("Informe ao menos um método")
        return value


class DriftMetricBase(BaseModel):
    """Schema base de métrica de drift persistida."""

    feature_name: str = Field(..., description="Nome da feature")
    psi_value: Optional[float] = Field(None, ge=0)
    ks_value: Optional[float] = Field(None, ge=0, le=1)
    ks_pvalue: Optional[float] = Field(None, ge=0, le=1)
    js_value: Optional[float] = Field(None, ge=0, le=1)
    wasserstein_value: Optional[float] = Field(None, ge=0)
    threshold: float = Field(0.25, ge=0)
    is_drift: bool = Field(False)


class DriftMetricResponse(DriftMetricBase):
    """Schema de resposta de métrica de drift."""

    id: int
    experiment_id: int
    window_start: datetime
    window_end: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DriftDetectionResponse(BaseModel):
    """Resposta da detecção de drift por janelas."""

    experiment_id: int
    window_start: datetime
    window_end: datetime
    metrics: list[DriftMetricResponse]
    overall_drift: bool
    max_drift_score: float
    features_with_drift: list[str]
    severity: Severity = "none"
    processing_time_ms: float
    thresholds: Optional[dict[str, Any]] = None


class DriftMetricsSummary(BaseModel):
    """Resumo das métricas de drift de um experimento."""

    experiment_id: int
    total_metrics: int
    total_features: int
    drifted_features: list[str]
    max_psi: float
    max_ks: float
    max_js: float
    max_wasserstein: float
    last_window_end: Optional[datetime] = None


# ============================================================
# Alertas
# ============================================================
class DriftAlertResponse(BaseModel):
    """Alerta de drift retornado pela API."""

    id: int
    experiment_id: Optional[int] = None
    model_version_id: Optional[int] = None
    alert_type: str
    severity: Severity
    message: str
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_json"
    )
    triggered_at: datetime
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DriftAlertListResponse(BaseModel):
    """Lista paginada de alertas."""

    items: list[DriftAlertResponse]
    total: int
    skip: int
    limit: int


class ResolveAlertRequest(BaseModel):
    """Requisição para resolver/reabrir um alerta."""

    resolved: bool = True
