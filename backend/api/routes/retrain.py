# backend/api/routes/retrain.py
"""
Endpoints de retreinamento orientado por alertas (T1.7 / T1.8).

O retreinamento roda em background para não bloquear a resposta HTTP. A
orquestração (coleta de dados, treino, persistência de versão/métricas/alerta e
promoção do novo artefato) fica em :class:`ml.retrain.ModelRetrainer`.
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.dependencies import get_db
from api.exceptions import NotFoundException
from db.models import Alert, Experiment, ModelVersion

logger = logging.getLogger(__name__)

router = APIRouter()


class RetrainRequest(BaseModel):
    """Requisição de retreinamento."""

    experiment_id: int
    reason: str = "manual"
    triggered_by: str = "api"
    rows: int | None = Field(
        default=None,
        ge=100,
        le=1_000_000,
        description="Limite de transações usadas no treino (default: dataset completo)",
    )


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
    db: Session = Depends(get_db),
):
    """Dispara o retreinamento do modelo do experimento."""
    experiment = (
        db.query(Experiment).filter(Experiment.id == request.experiment_id).first()
    )
    if not experiment:
        raise NotFoundException("Experiment", request.experiment_id)

    alert = Alert(
        experiment_id=request.experiment_id,
        alert_type="retrain_triggered",
        severity="info",
        message=f"Retreinamento disparado: {request.reason}",
        metadata_json={
            "reason": request.reason,
            "triggered_by": request.triggered_by,
            "rows": request.rows,
        },
    )
    db.add(alert)
    db.commit()

    background_tasks.add_task(
        _execute_retraining,
        experiment_id=request.experiment_id,
        reason=request.reason,
        triggered_by=request.triggered_by,
        rows=request.rows,
    )

    return RetrainResponse(
        experiment_id=request.experiment_id,
        status="triggered",
        message="Retreinamento iniciado em background",
        triggered_at=datetime.now(),
    )


def _execute_retraining(
    experiment_id: int,
    *,
    reason: str = "manual",
    triggered_by: str = "api",
    rows: int | None = None,
) -> None:
    """
    Executa o retreinamento em background e registra o resultado como alerta.

    Falhas não derrubam a API: são registradas em ``alerts`` com severidade
    ``critical`` para que o dashboard exponha o problema.
    """
    from db.database import SessionLocal
    from ml.retrain import ModelRetrainer

    db = SessionLocal()
    try:
        retrainer = ModelRetrainer(db)
        result = retrainer.retrain(
            experiment_id,
            reason=reason,
            triggered_by=triggered_by,
            rows=rows,
        )
        logger.info(
            "Retreinamento concluído: experimento=%s versão=%s F1=%s",
            experiment_id,
            result["version"],
            result["metrics"].get("f1"),
        )
    except Exception as exc:  # noqa: BLE001 - registrado como alerta
        logger.exception("Falha no retreinamento do experimento %s", experiment_id)
        try:
            db.rollback()
            db.add(
                Alert(
                    experiment_id=experiment_id,
                    alert_type="retrain_completed",
                    severity="critical",
                    message=f"Falha no retreinamento: {exc}",
                    metadata_json={
                        "status": "failed",
                        "reason": reason,
                        "triggered_by": triggered_by,
                        "error": str(exc),
                    },
                )
            )
            db.commit()
        except Exception:  # pragma: no cover - banco indisponível
            db.rollback()
            logger.exception("Não foi possível registrar a falha do retreinamento")
    finally:
        db.close()


@router.get("/history/{experiment_id}")
async def get_retrain_history(
    experiment_id: int,
    db: Session = Depends(get_db),
):
    """Obtém o histórico de retreinamentos do experimento."""
    alerts = (
        db.query(Alert)
        .filter(
            Alert.experiment_id == experiment_id,
            Alert.alert_type.in_(["retrain_triggered", "retrain_completed"]),
        )
        .order_by(Alert.triggered_at.desc())
        .all()
    )

    return [
        {
            "id": alert.id,
            "type": alert.alert_type,
            "severity": alert.severity,
            "message": alert.message,
            "metadata": alert.metadata_json,
            "triggered_at": alert.triggered_at,
        }
        for alert in alerts
    ]


@router.get("/versions/{experiment_id}")
async def get_model_versions(
    experiment_id: int,
    db: Session = Depends(get_db),
):
    """Lista as versões de modelo do experimento (mais recentes primeiro)."""
    versions = (
        db.query(ModelVersion)
        .filter(ModelVersion.experiment_id == experiment_id)
        .order_by(ModelVersion.trained_at.desc())
        .all()
    )
    return [
        {
            "id": version.id,
            "version": version.version,
            "model_type": version.model_type,
            "model_path": version.model_path,
            "is_active": version.is_active,
            "trained_at": version.trained_at,
            "training_metrics": version.training_metrics,
        }
        for version in versions
    ]
