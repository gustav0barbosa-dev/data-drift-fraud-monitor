"""
Endpoints de detecção de drift.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.dependencies import get_db
from api.schemas.drift import DriftDetectionRequest, DriftDetectionResponse, DriftMetricResponse
from api.exceptions import NotFoundException, DriftDetectionException
from drift.psi import calculate_psi
from drift.ks_test import calculate_ks
from drift.js_divergence import calculate_js
from drift.wasserstein import calculate_wasserstein
from drift.alert_system import AlertSystem
from db.models import Experiment, DriftMetric, Transaction, Alert
import pandas as pd

router = APIRouter()


@router.post("/detect", response_model=DriftDetectionResponse)
async def detect_drift(
    request: DriftDetectionRequest,
    db: Session = Depends(get_db)
):
    """
    Detecta drift entre duas janelas temporais.
    """
    # Verificar experimento
    experiment = db.query(Experiment).filter(Experiment.id == request.experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", request.experiment_id)
    
    # Obter dados das janelas
    reference_data = _get_window_data(db, request.reference_window_start, request.reference_window_end)
    current_data = _get_window_data(db, request.current_window_start, request.current_window_end)
    
    if reference_data.empty or current_data.empty:
        raise DriftDetectionException("Dados insuficientes nas janelas especificadas")
    
    # Features a analisar
    features = request.features or [c for c in reference_data.columns if c not in ["id", "is_fraud", "created_at"]]
    
    metrics = []
    features_with_drift = []
    max_drift_score = 0.0
    
    for feature in features:
        if feature not in reference_data.columns or feature not in current_data.columns:
            continue
        
        ref_values = reference_data[feature].dropna().values
        cur_values = current_data[feature].dropna().values
        
        if len(ref_values) < 30 or len(cur_values) < 30:
            continue
        
        metric_data = {
            "feature_name": feature,
            "experiment_id": request.experiment_id,
            "window_start": request.current_window_start,
            "window_end": request.current_window_end,
            "threshold": 0.25,  # Limiar padrão PSI
            "is_drift": False
        }
        
        # Calcular métricas conforme solicitado
        if "psi" in request.methods:
            psi_value = calculate_psi(ref_values, cur_values)
            metric_data["psi_value"] = psi_value
            if psi_value > 0.25:
                metric_data["is_drift"] = True
        
        if "ks" in request.methods:
            ks_stat, ks_pvalue = calculate_ks(ref_values, cur_values)
            metric_data["ks_value"] = ks_stat
            metric_data["ks_pvalue"] = ks_pvalue
            if ks_pvalue < 0.05:
                metric_data["is_drift"] = True
        
        if "js" in request.methods:
            js_value = calculate_js(ref_values, cur_values)
            metric_data["js_value"] = js_value
            if js_value > 0.1:
                metric_data["is_drift"] = True
        
        if "wasserstein" in request.methods:
            w_value = calculate_wasserstein(ref_values, cur_values)
            metric_data["wasserstein_value"] = w_value
        
        # Salvar métrica
        db_metric = DriftMetric(**metric_data)
        db.add(db_metric)
        metrics.append(db_metric)
        
        if metric_data["is_drift"]:
            features_with_drift.append(feature)
        
        # Atualizar score máximo
        drift_score = max(
            metric_data.get("psi_value", 0) or 0,
            metric_data.get("ks_value", 0) or 0,
            metric_data.get("js_value", 0) or 0
        )
        max_drift_score = max(max_drift_score, drift_score)
    
    db.commit()
    
    # Gerar alertas se necessário
    overall_drift = len(features_with_drift) > 0
    if overall_drift:
        alert_system = AlertSystem(db)
        alert_system.create_drift_alert(
            experiment_id=request.experiment_id,
            features=features_with_drift,
            max_score=max_drift_score
        )
    
    return DriftDetectionResponse(
        experiment_id=request.experiment_id,
        window_start=request.current_window_start,
        window_end=request.current_window_end,
        metrics=[DriftMetricResponse.model_validate(m) for m in metrics],
        overall_drift=overall_drift,
        max_drift_score=max_drift_score,
        features_with_drift=features_with_drift
    )


@router.get("/metrics/{experiment_id}", response_model=list[DriftMetricResponse])
async def get_drift_metrics(
    experiment_id: int,
    feature: str = None,
    db: Session = Depends(get_db)
):
    """
    Obtém métricas de drift de um experimento.
    """
    query = db.query(DriftMetric).filter(DriftMetric.experiment_id == experiment_id)
    
    if feature:
        query = query.filter(DriftMetric.feature_name == feature)
    
    metrics = query.order_by(DriftMetric.window_start.desc()).all()
    return [DriftMetricResponse.model_validate(m) for m in metrics]


def _get_window_data(db: Session, start, end) -> pd.DataFrame:
    """Obtém dados de uma janela temporal como DataFrame."""
    transactions = db.query(Transaction).filter(
        Transaction.created_at >= start,
        Transaction.created_at <= end
    ).all()
    
    if not transactions:
        return pd.DataFrame()
    
    data = []
    for t in transactions:
        data.append({
            "id": t.id,
            "step": t.step,
            "type": t.type,
            "amount": float(t.amount),
            "old_balance_org": float(t.old_balance_org) if t.old_balance_org else 0,
            "new_balance_org": float(t.new_balance_org) if t.new_balance_org else 0,
            "old_balance_dest": float(t.old_balance_dest) if t.old_balance_dest else 0,
            "new_balance_dest": float(t.new_balance_dest) if t.new_balance_dest else 0,
            "is_fraud": t.is_fraud,
            "created_at": t.created_at
        })
    
    return pd.DataFrame(data)