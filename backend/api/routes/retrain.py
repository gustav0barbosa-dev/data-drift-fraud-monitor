# backend/api/routes/retrain.py
"""
Endpoints de retreinamento.
"""
from fastapi import APIRouter, Depends, BackgroundTasks, status
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel

from api.dependencies import get_db
from api.exceptions import NotFoundException
from db.models import Experiment, ModelVersion, Alert

router = APIRouter()


class RetrainRequest(BaseModel):
    """Requisição de retreinamento."""
    experiment_id: int
    reason: str = "manual"
    triggered_by: str = "api"


class RetrainResponse(BaseModel):
    """Resposta de retreinamento."""
    experiment_id: int
    status: str
    message: str
    triggered_at: datetime


@router.post("/", response_model=RetrainResponse, status_code=status.HTTP_202_ACCEPTED)
async def retrain_model(
    request: RetrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Dispara retreinamento do modelo."""
    experiment = db.query(Experiment).filter(
        Experiment.id == request.experiment_id
    ).first()
    if not experiment:
        raise NotFoundException("Experiment", request.experiment_id)
    
    # Registrar alerta
    alert = Alert(
        experiment_id=request.experiment_id,
        alert_type="retrain_triggered",
        severity="info",
        message=f"Retreinamento disparado: {request.reason}",
        metadata_json={"reason": request.reason, "triggered_by": request.triggered_by}
    )
    db.add(alert)
    db.commit()
    
    # Executar em background
    background_tasks.add_task(
        _execute_retraining,
        experiment_id=request.experiment_id
    )
    
    return RetrainResponse(
        experiment_id=request.experiment_id,
        status="triggered",
        message="Retreinamento iniciado em background",
        triggered_at=datetime.now()
    )


async def _execute_retraining(experiment_id: int):
    """
    Executa retreinamento em background.
    
    Nota: Esta função deve ser implementada pela Pessoa 1.
    Aqui é apenas um placeholder que registra o evento.
    """
    from db.database import SessionLocal
    
    db = SessionLocal()
    try:
        # TODO: Integrar com ml/retrain.py (Pessoa 1)
        # retrainer = ModelRetrainer(db)
        # new_version = retrainer.retrain(experiment_id)
        
        alert = Alert(
            experiment_id=experiment_id,
            alert_type="retrain_completed",
            severity="info",
            message="Retreinamento concluído (placeholder)",
            metadata_json={"status": "placeholder"}
        )
        db.add(alert)
        db.commit()
    except Exception as e:
        alert = Alert(
            experiment_id=experiment_id,
            alert_type="retrain_completed",
            severity="critical",
            message=f"Falha no retreinamento: {str(e)}"
        )
        db.add(alert)
        db.commit()
    finally:
        db.close()


@router.get("/history/{experiment_id}")
async def get_retrain_history(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Obtém histórico de retreinamentos."""
    alerts = db.query(Alert).filter(
        Alert.experiment_id == experiment_id,
        Alert.alert_type.in_(["retrain_triggered", "retrain_completed"])
    ).order_by(Alert.triggered_at.desc()).all()
    
    return [{
        "id": a.id,
        "type": a.alert_type,
        "severity": a.severity,
        "message": a.message,
        "triggered_at": a.triggered_at
    } for a in alerts]