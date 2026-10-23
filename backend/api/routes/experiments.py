"""
Endpoints de gerenciamento de experimentos.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional

from api.dependencies import get_db, get_pagination, PaginationParams, get_experiment_filters, ExperimentFilters
from api.schemas.experiment import (
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentResponse,
    ExperimentListResponse
)
from api.schemas.common import DeleteResponse
from api.exceptions import NotFoundException, ConflictException
from db.models import Experiment

router = APIRouter()


# ============================================================
# CREATE
# ============================================================
@router.post(
    "/",
    response_model=ExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar experimento",
    description="Cria um novo experimento científico."
)
async def create_experiment(
    experiment: ExperimentCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo experimento."""
    # Verificar nome único
    existing = db.query(Experiment).filter(
        Experiment.name == experiment.name
    ).first()
    
    if existing:
        raise ConflictException(
            message=f"Já existe um experimento com o nome '{experiment.name}'"
        )
    
    # Criar experimento
    db_experiment = Experiment(**experiment.model_dump())
    db.add(db_experiment)
    db.commit()
    db.refresh(db_experiment)
    
    return ExperimentResponse.model_validate(db_experiment)


# ============================================================
# READ (Lista)
# ============================================================
@router.get(
    "/",
    response_model=ExperimentListResponse,
    summary="Listar experimentos",
    description="Lista experimentos com filtros e paginação."
)
async def list_experiments(
    pagination: PaginationParams = Depends(get_pagination),
    filters: ExperimentFilters = Depends(get_experiment_filters),
    db: Session = Depends(get_db)
):
    """Lista experimentos com filtros opcionais."""
    query = db.query(Experiment)
    
    # Aplicar filtros
    if filters.status:
        query = query.filter(Experiment.status == filters.status)
    
    if filters.drift_level:
        query = query.filter(Experiment.drift_level == filters.drift_level)
    
    if filters.search:
        search_term = f"%{filters.search}%"
        query = query.filter(
            or_(
                Experiment.name.ilike(search_term),
                Experiment.description.ilike(search_term)
            )
        )
    
    # Total
    total = query.count()
    
    # Paginação
    experiments = (
        query
        .order_by(Experiment.created_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
        .all()
    )
    
    return ExperimentListResponse(
        items=[ExperimentResponse.model_validate(e) for e in experiments],
        total=total,
        skip=pagination.skip,
        limit=pagination.limit,
        has_next=(pagination.skip + pagination.limit) < total,
        has_prev=pagination.skip > 0
    )


# ============================================================
# READ (Único)
# ============================================================
@router.get(
    "/{experiment_id}",
    response_model=ExperimentResponse,
    summary="Obter experimento",
    description="Obtém um experimento pelo ID."
)
async def get_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Obtém um experimento por ID."""
    experiment = db.query(Experiment).filter(
        Experiment.id == experiment_id
    ).first()
    
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    return ExperimentResponse.model_validate(experiment)


# ============================================================
# UPDATE
# ============================================================
@router.patch(
    "/{experiment_id}",
    response_model=ExperimentResponse,
    summary="Atualizar experimento",
    description="Atualiza parcialmente um experimento."
)
async def update_experiment(
    experiment_id: int,
    update: ExperimentUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um experimento."""
    experiment = db.query(Experiment).filter(
        Experiment.id == experiment_id
    ).first()
    
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    # Atualizar campos
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(experiment, field, value)
    
    db.commit()
    db.refresh(experiment)
    
    return ExperimentResponse.model_validate(experiment)


# ============================================================
# DELETE
# ============================================================
@router.delete(
    "/{experiment_id}",
    response_model=DeleteResponse,
    summary="Remover experimento",
    description="Remove um experimento e todos os dados relacionados."
)
async def delete_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Remove um experimento."""
    experiment = db.query(Experiment).filter(
        Experiment.id == experiment_id
    ).first()
    
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    db.delete(experiment)
    db.commit()
    
    return DeleteResponse(
        message=f"Experimento '{experiment.name}' removido com sucesso",
        deleted_id=experiment_id
    )


# ============================================================
# STATUS
# ============================================================
@router.post(
    "/{experiment_id}/start",
    response_model=ExperimentResponse,
    summary="Iniciar experimento",
    description="Marca um experimento como em execução."
)
async def start_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Inicia a execução de um experimento."""
    experiment = db.query(Experiment).filter(
        Experiment.id == experiment_id
    ).first()
    
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    from datetime import datetime
    experiment.status = "running"
    experiment.started_at = datetime.now()
    db.commit()
    db.refresh(experiment)
    
    return ExperimentResponse.model_validate(experiment)


@router.post(
    "/{experiment_id}/complete",
    response_model=ExperimentResponse,
    summary="Concluir experimento",
    description="Marca um experimento como concluído."
)
async def complete_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Marca um experimento como concluído."""
    experiment = db.query(Experiment).filter(
        Experiment.id == experiment_id
    ).first()
    
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    from datetime import datetime
    experiment.status = "completed"
    experiment.finished_at = datetime.now()
    db.commit()
    db.refresh(experiment)
    
    return ExperimentResponse.model_validate(experiment)