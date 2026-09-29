"""
Endpoints de retreinamento de modelo.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from api.dependencies import get_db
from api.schemas.retrain import RetrainRequest, RetrainResponse
from api.exceptions import NotFoundException
from ml.retrain import ModelRetrainer
from db.models import Experiment, ModelVersion, Alert

router = APIRouter()


@router.post("/", response_model=RetrainResponse)
async def retrain_model(
    request: RetrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Dispara o retreinamento do modelo.
    """
    # Verificar experimento
    experiment = db.query(Experiment).filter(Experiment.id == request.experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", request.experiment_id)
    
    # Criar registro de alerta
    alert = Alert(
        experiment_id=request.experiment_id,
        alert_type="retrain_triggered",
        severity="info",
        message=f"Retreinamento disparado: {request.reason}",
        metadata={"reason": request.reason, "triggered_by": request.triggered_by}
    )
    db.add(alert)
    db.commit()
    
    # Executar retreinamento em background
    background_tasks.add_task(
        _execute_retraining,
        experiment_id=request.experiment_id,
        db=db
    )
    
    return RetrainResponse(
        experiment_id=request.experiment_id,
        status="triggered",
        message="Retreinamento iniciado em background",
        triggered_at=datetime.now()
    )


async def _execute_retraining(experiment_id: int, db: Session):
    """Executa o retreinamento em background."""
    try:
        retrainer = ModelRetrainer(db)
        new_version = retrainer.retrain(experiment_id)
        
        # Registrar alerta de conclusão
        alert = Alert(
            experiment_id=experiment_id,
            model_version_id=new_version.id,
            alert_type="retrain_completed",
            severity="info",
            message=f"Retreinamento concluído: versão {new_version.version}",
            metadata={"version": new_version.version}
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


@router.get("/history/{experiment_id}")
async def get_retrain_history(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtém o histórico de retreinamentos de um experimento.
    """
    alerts = db.query(Alert).filter(
        Alert.experiment_id == experiment_id,
        Alert.alert_type.in_(["retrain_triggered", "retrain_completed"])
    ).order_by(Alert.triggered_at.desc()).all()
    
    return [
        {
            "id": a.id,
            "type": a.alert_type,
            "severity": a.severity,
            "message": a.message,
            "triggered_at": a.triggered_at
        }
        for a in alerts
    ]