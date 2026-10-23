# backend/api/routes/metrics.py
"""
Endpoints de métricas de desempenho.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.dependencies import get_db
from api.schemas.performance import PerformanceResponse, PerformanceSummary
from db.models import Performance, ModelVersion

router = APIRouter()


@router.get(
    "/performance/{model_version_id}",
    response_model=list[PerformanceResponse],
    summary="Métricas de desempenho"
)
async def get_performance(
    model_version_id: int,
    db: Session = Depends(get_db)
):
    """Obtém métricas de desempenho de uma versão do modelo."""
    metrics = db.query(Performance).filter(
        Performance.model_version_id == model_version_id
    ).order_by(Performance.window_start).all()
    
    return [PerformanceResponse.model_validate(m) for m in metrics]


@router.get(
    "/performance/summary/{experiment_id}",
    response_model=PerformanceSummary,
    summary="Resumo de desempenho"
)
async def get_performance_summary(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Obtém resumo de desempenho de um experimento."""
    model_versions = db.query(ModelVersion).filter(
        ModelVersion.experiment_id == experiment_id
    ).all()
    
    if not model_versions:
        return PerformanceSummary(
            experiment_id=experiment_id,
            versions=[],
            best_f1=0.0,
            worst_f1=0.0,
            degradation=0.0
        )
    
    versions_data = []
    f1_scores = []
    
    for mv in model_versions:
        performances = db.query(Performance).filter(
            Performance.model_version_id == mv.id
        ).all()
        
        if performances:
            valid_f1 = [p.f1_score for p in performances if p.f1_score is not None]
            if valid_f1:
                avg_f1 = sum(valid_f1) / len(valid_f1)
                f1_scores.append(avg_f1)
                versions_data.append({
                    "version": mv.version,
                    "avg_f1": round(avg_f1, 4),
                    "trained_at": mv.trained_at.isoformat() if mv.trained_at else None
                })
    
    return PerformanceSummary(
        experiment_id=experiment_id,
        versions=versions_data,
        best_f1=round(max(f1_scores), 4) if f1_scores else 0.0,
        worst_f1=round(min(f1_scores), 4) if f1_scores else 0.0,
        degradation=round(max(f1_scores) - min(f1_scores), 4) if f1_scores else 0.0
    )