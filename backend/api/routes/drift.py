# backend/api/routes/drift.py
"""
Endpoints de detecção de drift e alertas.

Integra os módulos estatísticos da Pessoa 2:

- ``drift.psi``               -> Population Stability Index
- ``drift.ks_test``           -> Kolmogorov-Smirnov
- ``drift.js_divergence``     -> Jensen-Shannon
- ``drift.wasserstein``       -> Distância de Wasserstein
- ``drift.detector``          -> orquestração e classificação
- ``drift.alert_system``      -> alertas, severidade e deduplicação
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
import logging
import time

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_pagination, PaginationParams
from api.exceptions import (
    BadRequestException,
    DriftDetectionException,
    NotFoundException,
)
from api.schemas.drift import (
    DriftAlertListResponse,
    DriftAlertResponse,
    DriftDetectionRequest,
    DriftDetectionResponse,
    DriftMetricResponse,
    DriftMetricsSummary,
    FeatureDriftBatchRequest,
    FeatureDriftBatchResponse,
    FeatureDriftRequest,
    FeatureDriftResponse,
    ResolveAlertRequest,
)
from db.models import Alert, DriftMetric, Experiment, Transaction
from drift.alert_system import AlertSystem
from drift.detector import DriftDetector
from drift.thresholds import DEFAULT_THRESHOLDS, DriftThresholds

router = APIRouter()
logger = logging.getLogger(__name__)

# Colunas que nunca devem ser tratadas como features de drift.
DEFAULT_EXCLUDED_COLUMNS = {"id", "is_fraud", "is_flagged_fraud", "created_at"}


# ============================================================
# Detecção sem banco (valores brutos)
# ============================================================
@router.post(
    "/detect/feature",
    response_model=FeatureDriftResponse,
    summary="Detectar drift em uma feature",
    description=(
        "Calcula PSI, KS, Jensen-Shannon e Wasserstein para duas listas de "
        "valores, sem consultar o banco de dados."
    ),
)
async def detect_feature_drift(request: FeatureDriftRequest) -> FeatureDriftResponse:
    """Detecta drift a partir de valores brutos (útil para E3 e dashboard)."""
    thresholds = _build_thresholds(request.thresholds)
    detector = DriftDetector(thresholds, methods=request.methods)

    try:
        result = detector.detect(
            request.reference,
            request.current,
            feature_name=request.feature_name,
            categorical=request.categorical,
        )
    except (TypeError, ValueError) as exc:
        raise BadRequestException(str(exc)) from exc

    if not any(method.get("available") for method in result["methods"].values()):
        raise BadRequestException(
            "Nenhum método pôde ser calculado para os dados informados"
        )

    return FeatureDriftResponse(**result)


@router.post(
    "/detect/batch",
    response_model=FeatureDriftBatchResponse,
    summary="Detectar drift em lote",
    description="Executa a detecção de drift para várias features de uma vez.",
)
async def detect_batch_drift(
    request: FeatureDriftBatchRequest,
) -> FeatureDriftBatchResponse:
    """Detecta drift para um lote de features sem acesso ao banco."""
    results: list[FeatureDriftResponse] = []

    for feature in request.features:
        thresholds = _build_thresholds(feature.thresholds)
        detector = DriftDetector(thresholds, methods=feature.methods)
        try:
            result = detector.detect(
                feature.reference,
                feature.current,
                feature_name=feature.feature_name,
                categorical=feature.categorical,
            )
        except (TypeError, ValueError) as exc:
            raise BadRequestException(
                f"Feature {feature.feature_name or '<sem nome>'}: {exc}"
            ) from exc
        results.append(FeatureDriftResponse(**result))

    drifted = [r.feature_name for r in results if r.is_drift and r.feature_name]
    return FeatureDriftBatchResponse(
        results=results,
        overall_drift=any(r.is_drift for r in results),
        max_severity=_max_severity([r.severity for r in results]),
        max_drift_score=max((r.drift_score for r in results), default=0.0),
        drifted_features=drifted,
    )


# ============================================================
# Detecção por janelas persistidas
# ============================================================
@router.post(
    "/detect",
    response_model=DriftDetectionResponse,
    summary="Detectar drift",
    description=(
        "Detecta drift entre duas janelas temporais de transações usando "
        "múltiplos métodos estatísticos e persiste as métricas."
    ),
)
async def detect_drift(
    request: DriftDetectionRequest,
    db: Session = Depends(get_db),
) -> DriftDetectionResponse:
    """Detecta drift entre janelas de referência e atual."""
    start_time = time.time()

    experiment = db.query(Experiment).filter(
        Experiment.id == request.experiment_id
    ).first()
    if not experiment:
        raise NotFoundException("Experiment", request.experiment_id)

    reference_data = _get_window_data(
        db, request.reference_window_start, request.reference_window_end
    )
    current_data = _get_window_data(
        db, request.current_window_start, request.current_window_end
    )

    if reference_data.empty or current_data.empty:
        raise DriftDetectionException(
            "Dados insuficientes nas janelas especificadas"
        )

    feature_names = _resolve_features(request.features, reference_data, current_data)
    if not feature_names:
        raise DriftDetectionException("Nenhuma feature válida para analisar")

    thresholds = _build_thresholds(request.thresholds)
    detector = DriftDetector(thresholds, methods=request.methods)

    feature_types = request.feature_types or {}
    categorical_features = [
        name for name, kind in feature_types.items() if kind == "categorical"
    ]
    numeric_features = [
        name for name, kind in feature_types.items() if kind == "numeric"
    ]
    forced_categorical = set(categorical_features)
    forced_numeric = set(numeric_features)

    drift_results: dict[str, dict[str, Any]] = {}
    for feature in feature_names:
        categorical: Optional[bool] = None
        if feature in forced_categorical:
            categorical = True
        elif feature in forced_numeric:
            categorical = False

        try:
            drift_results[feature] = detector.detect(
                reference_data[feature],
                current_data[feature],
                feature_name=feature,
                categorical=categorical,
            )
        except (TypeError, ValueError) as exc:
            # Uma feature problemática não deve derrubar a análise inteira.
            drift_results[feature] = {
                "feature_name": feature,
                "n_reference": int(reference_data[feature].notna().sum()),
                "n_current": int(current_data[feature].notna().sum()),
                "categorical": bool(categorical),
                "insufficient_data": True,
                "methods": {},
                "psi": None,
                "ks_stat": None,
                "ks_pvalue": None,
                "js": None,
                "wasserstein": None,
                "wasserstein_normalized": None,
                "severity": "none",
                "is_drift": False,
                "drift_score": 0.0,
                "warnings": [str(exc)],
            }

    metrics: list[DriftMetric] = []
    features_with_drift: list[str] = []
    severities: list[str] = []
    max_drift_score = 0.0

    for feature, result in drift_results.items():
        severities.append(
            "none" if result.get("insufficient_data") else result["severity"]
        )
        max_drift_score = max(max_drift_score, float(result["drift_score"]))

        if result["is_drift"]:
            features_with_drift.append(feature)

        metric = DriftMetric(
            experiment_id=request.experiment_id,
            window_start=request.current_window_start,
            window_end=request.current_window_end,
            feature_name=feature,
            psi_value=_round_optional(result.get("psi")),
            ks_value=_round_optional(result.get("ks_stat")),
            ks_pvalue=_round_optional(result.get("ks_pvalue")),
            js_value=_round_optional(result.get("js")),
            wasserstein_value=_round_optional(result.get("wasserstein")),
            threshold=thresholds.psi.critical,
            is_drift=bool(result["is_drift"]),
        )
        db.add(metric)
        metrics.append(metric)

    try:
        db.commit()
        for metric in metrics:
            db.refresh(metric)
    except Exception as exc:
        db.rollback()
        raise DriftDetectionException(f"Erro ao persistir métricas: {exc}") from exc

    overall_severity = _max_severity(severities)
    overall_drift = bool(features_with_drift)

    # Alertas: agregados, com cooldown e escalada de severidade.
    # Uma falha no alerta não deve invalidar as métricas já persistidas.
    try:
        AlertSystem(db, thresholds).process(
            experiment_id=request.experiment_id,
            feature_results=drift_results,
            window_start=request.current_window_start,
            window_end=request.current_window_end,
        )
    except Exception as exc:  # pragma: no cover - defensivo
        logger.warning("Falha ao criar alerta de drift: %s", exc)
        db.rollback()

    processing_time = (time.time() - start_time) * 1000

    return DriftDetectionResponse(
        experiment_id=request.experiment_id,
        window_start=request.current_window_start,
        window_end=request.current_window_end,
        metrics=[DriftMetricResponse.model_validate(m) for m in metrics],
        overall_drift=overall_drift,
        max_drift_score=round(max_drift_score, 4),
        features_with_drift=features_with_drift,
        severity=overall_severity,
        processing_time_ms=round(processing_time, 2),
        thresholds=thresholds.to_dict(),
    )


# ============================================================
# Consulta de métricas
# ============================================================
@router.get(
    "/metrics/{experiment_id}",
    response_model=list[DriftMetricResponse],
    summary="Listar métricas de drift",
)
async def get_drift_metrics(
    experiment_id: int,
    feature: Optional[str] = None,
    only_drift: bool = Query(False, description="Retorna apenas features com drift"),
    pagination: PaginationParams = Depends(get_pagination),
    db: Session = Depends(get_db),
) -> list[DriftMetricResponse]:
    """Obtém métricas de drift de um experimento."""
    _ensure_experiment(db, experiment_id)

    query = db.query(DriftMetric).filter(
        DriftMetric.experiment_id == experiment_id
    )
    if feature:
        query = query.filter(DriftMetric.feature_name == feature)
    if only_drift:
        query = query.filter(DriftMetric.is_drift.is_(True))

    metrics = (
        query.order_by(DriftMetric.window_start.desc(), DriftMetric.feature_name)
        .offset(pagination.skip)
        .limit(pagination.limit)
        .all()
    )
    return [DriftMetricResponse.model_validate(m) for m in metrics]


@router.get(
    "/metrics/{experiment_id}/summary",
    response_model=DriftMetricsSummary,
    summary="Resumo das métricas de drift",
    description="Consolida as métricas de drift de um experimento.",
)
async def get_drift_metrics_summary(
    experiment_id: int,
    db: Session = Depends(get_db),
) -> DriftMetricsSummary:
    """Retorna um resumo agregado das métricas de drift."""
    _ensure_experiment(db, experiment_id)

    metrics = (
        db.query(DriftMetric)
        .filter(DriftMetric.experiment_id == experiment_id)
        .all()
    )

    drifted = sorted({m.feature_name for m in metrics if m.is_drift})
    features = {m.feature_name for m in metrics}

    return DriftMetricsSummary(
        experiment_id=experiment_id,
        total_metrics=len(metrics),
        total_features=len(features),
        drifted_features=drifted,
        max_psi=_max_numeric(m.psi_value for m in metrics),
        max_ks=_max_numeric(m.ks_value for m in metrics),
        max_js=_max_numeric(m.js_value for m in metrics),
        max_wasserstein=_max_numeric(m.wasserstein_value for m in metrics),
        last_window_end=max(
            (m.window_end for m in metrics if m.window_end is not None),
            default=None,
        ),
    )


# ============================================================
# Limiares
# ============================================================
@router.get(
    "/thresholds",
    summary="Consultar limiares de drift",
    description="Retorna os limiares padrão usados na classificação de drift.",
)
async def get_thresholds() -> dict[str, Any]:
    """Retorna a configuração padrão de limiares."""
    return DEFAULT_THRESHOLDS.to_dict()


# ============================================================
# Alertas
# ============================================================
@router.get(
    "/alerts/{experiment_id}",
    response_model=DriftAlertListResponse,
    summary="Listar alertas de drift",
)
async def get_drift_alerts(
    experiment_id: int,
    include_resolved: bool = Query(False),
    pagination: PaginationParams = Depends(get_pagination),
    db: Session = Depends(get_db),
) -> DriftAlertListResponse:
    """Lista alertas de drift de um experimento."""
    _ensure_experiment(db, experiment_id)

    query = db.query(Alert).filter(
        Alert.experiment_id == experiment_id,
        Alert.alert_type == "drift_detected",
    )
    if not include_resolved:
        query = query.filter(Alert.is_resolved.is_(False))

    total = query.count()
    alerts = (
        query.order_by(Alert.triggered_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
        .all()
    )

    return DriftAlertListResponse(
        items=[DriftAlertResponse.model_validate(a) for a in alerts],
        total=total,
        skip=pagination.skip,
        limit=pagination.limit,
    )


@router.patch(
    "/alerts/{alert_id}/resolve",
    response_model=DriftAlertResponse,
    summary="Resolver alerta de drift",
)
async def resolve_drift_alert(
    alert_id: int,
    request: ResolveAlertRequest,
    db: Session = Depends(get_db),
) -> DriftAlertResponse:
    """Marca um alerta como resolvido (ou reabre, com ``resolved=false``)."""
    alert = AlertSystem(db).resolve_alert(alert_id, resolved=request.resolved)
    if alert is None:
        raise NotFoundException("Alert", alert_id)
    return DriftAlertResponse.model_validate(alert)


# ============================================================
# Helpers
# ============================================================
def _build_thresholds(overrides: Optional[dict[str, Any]]) -> DriftThresholds:
    try:
        return DriftThresholds.from_dict(overrides)
    except (TypeError, ValueError) as exc:
        raise BadRequestException(f"Limiares inválidos: {exc}") from exc


def _resolve_features(
    requested: Optional[list[str]],
    reference_data: pd.DataFrame,
    current_data: pd.DataFrame,
) -> list[str]:
    if requested:
        candidates = requested
    else:
        candidates = [
            column
            for column in reference_data.columns
            if column in current_data.columns
            and column not in DEFAULT_EXCLUDED_COLUMNS
        ]

    return [
        feature
        for feature in candidates
        if feature in reference_data.columns and feature in current_data.columns
    ]


def _ensure_experiment(db: Session, experiment_id: int) -> None:
    exists = db.query(Experiment.id).filter(
        Experiment.id == experiment_id
    ).first()
    if not exists:
        raise NotFoundException("Experiment", experiment_id)


def _round_optional(value: Optional[float], digits: int = 6) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def _max_numeric(values: Any) -> float:
    valid = [float(v) for v in values if v is not None]
    return round(max(valid), 6) if valid else 0.0


def _max_severity(severities: list[str]) -> str:
    order = {"none": 0, "warning": 1, "critical": 2}
    return max(severities, key=lambda s: order.get(s, 0), default="none")


def _get_window_data(
    db: Session,
    start: datetime,
    end: datetime,
) -> pd.DataFrame:
    """Obtém dados de uma janela temporal como DataFrame."""
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.created_at >= start,
            Transaction.created_at <= end,
        )
        .all()
    )

    if not transactions:
        return pd.DataFrame()

    data = [
        {
            "id": t.id,
            "step": t.step,
            "type": t.type,
            "amount": float(t.amount) if t.amount is not None else np.nan,
            "old_balance_org": float(t.old_balance_org)
            if t.old_balance_org is not None
            else np.nan,
            "new_balance_org": float(t.new_balance_org)
            if t.new_balance_org is not None
            else np.nan,
            "old_balance_dest": float(t.old_balance_dest)
            if t.old_balance_dest is not None
            else np.nan,
            "new_balance_dest": float(t.new_balance_dest)
            if t.new_balance_dest is not None
            else np.nan,
            "is_fraud": t.is_fraud,
            "created_at": t.created_at,
        }
        for t in transactions
    ]

    return pd.DataFrame(data)
