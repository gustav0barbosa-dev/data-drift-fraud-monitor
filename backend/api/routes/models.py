# backend/api/routes/models.py
"""
Endpoints de consulta das versões de modelo.

Complementam ``/api/v1/metrics``: enquanto os endpoints de métricas expõem as
séries de desempenho, estes expõem os metadados do artefato treinado (versão,
hiperparâmetros e métricas de treino) usados pelo dashboard.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.dependencies import get_db
from api.exceptions import NotFoundException
from api.schemas.model import ModelVersionListResponse, ModelVersionResponse
from db.models import Experiment, ModelVersion

router = APIRouter()


@router.get(
    "/{experiment_id}",
    response_model=ModelVersionListResponse,
    summary="Listar versões de modelo",
    description="Lista as versões de modelo treinadas para um experimento.",
)
async def list_model_versions(
    experiment_id: int,
    db: Session = Depends(get_db),
) -> ModelVersionListResponse:
    """Lista versões de modelo, destacando a ativa."""
    experiment = db.query(Experiment.id).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)

    versions = (
        db.query(ModelVersion)
        .filter(ModelVersion.experiment_id == experiment_id)
        .order_by(ModelVersion.trained_at.desc(), ModelVersion.id.desc())
        .all()
    )
    items = [ModelVersionResponse.model_validate(version) for version in versions]
    active = next((item for item in items if item.is_active), None)

    return ModelVersionListResponse(items=items, total=len(items), active=active)


@router.get(
    "/{experiment_id}/active",
    response_model=ModelVersionResponse,
    summary="Modelo ativo do experimento",
    description="Retorna a versão marcada como ativa para o experimento.",
)
async def get_active_model(
    experiment_id: int,
    db: Session = Depends(get_db),
) -> ModelVersionResponse:
    """Retorna o modelo ativo do experimento."""
    experiment = db.query(Experiment.id).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)

    model = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.experiment_id == experiment_id,
            ModelVersion.is_active.is_(True),
        )
        .first()
    )
    if model is None:
        raise NotFoundException(
            "ModelVersion ativa",
            experiment_id,
        )

    return ModelVersionResponse.model_validate(model)
