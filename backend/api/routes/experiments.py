"""
Endpoints de gerenciamento de experimentos.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from api.dependencies import get_db
from api.schemas.experiment import ExperimentCreate, ExperimentResponse, ExperimentUpdate
from api.exceptions import NotFoundException
from db.models import Experiment

router = APIRouter()


@router.post("/", response_model=ExperimentResponse)
async def create_experiment(
    experiment: ExperimentCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo experimento."""
    db_experiment = Experiment(**experiment.model_dump())
    db.add(db_experiment)
    db.commit()
    db.refresh(db_experiment)
    return ExperimentResponse.model_validate(db_experiment)


@router.get("/", response_model=List[ExperimentResponse])
async def list_experiments(
    status: str = None,
    drift_level: str = None,
    db: Session = Depends(get_db)
):
    """Lista experimentos com filtros opcionais."""
    query = db.query(Experiment)
    
    if status:
        query = query.filter(Experiment.status == status)
    if drift_level:
        query = query.filter(Experiment.drift_level == drift_level)
    
    experiments = query.order_by(Experiment.created_at.desc()).all()
    return [ExperimentResponse.model_validate(e) for e in experiments]


@router.get("/{experiment_id}", response_model=ExperimentResponse)
async def get_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Obtém um experimento por ID."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    return ExperimentResponse.model_validate(experiment)


@router.patch("/{experiment_id}", response_model=ExperimentResponse)
async def update_experiment(
    experiment_id: int,
    update: ExperimentUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um experimento."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(experiment, field, value)
    
    db.commit()
    db.refresh(experiment)
    return ExperimentResponse.model_validate(experiment)


@router.delete("/{experiment_id}")
async def delete_experiment(
    experiment_id: int,
    db: Session = Depends(get_db)
):
    """Remove um experimento."""
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise NotFoundException("Experiment", experiment_id)
    
    db.delete(experiment)
    db.commit()
    return {"message": f"Experimento {experiment_id} removido com sucesso"}