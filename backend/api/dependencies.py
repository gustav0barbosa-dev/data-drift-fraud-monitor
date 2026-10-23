"""
Dependências compartilhadas da API.
"""
from typing import Generator, Optional
from fastapi import Depends, Query
from sqlalchemy.orm import Session

from db.database import SessionLocal
from ml.predict import FraudPredictor
from api.exceptions import ModelNotLoadedException


# ============================================================
# Banco de Dados
# ============================================================
def get_db() -> Generator[Session, None, None]:
    """
    Fornece uma sessão de banco de dados por requisição.
    Garante que a sessão seja fechada ao final.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_predictor() -> FraudPredictor:
    """Obtém o preditor carregado."""
    from api.main import app_state
    
    if app_state.predictor is None or not app_state.predictor.is_loaded():
        raise ModelNotLoadedException()
    
    return app_state.predictor


def get_active_model_version(db: Session = Depends(get_db)):
    """Obtém a versão ativa do modelo."""
    from db.models import ModelVersion
    model = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()
    if not model:
        raise ModelNotLoadedException()
    return model


# ============================================================
# Paginação
# ============================================================
class PaginationParams:
    """Parâmetros de paginação reutilizáveis."""
    
    def __init__(
        self,
        skip: int = Query(0, ge=0, description="Número de registros a pular"),
        limit: int = Query(100, ge=1, le=1000, description="Número máximo de registros")
    ):
        self.skip = skip
        self.limit = limit


def get_pagination(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
) -> PaginationParams:
    """Dependency para paginação."""
    return PaginationParams(skip=skip, limit=limit)


# ============================================================
# Filtros
# ============================================================
class ExperimentFilters:
    """Filtros para busca de experimentos."""
    
    def __init__(
        self,
        status: Optional[str] = Query(None, description="Filtrar por status"),
        drift_level: Optional[str] = Query(None, description="Filtrar por nível de drift"),
        search: Optional[str] = Query(None, description="Buscar por nome ou descrição")
    ):
        self.status = status
        self.drift_level = drift_level
        self.search = search


def get_experiment_filters(
    status: Optional[str] = Query(None),
    drift_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
) -> ExperimentFilters:
    """Dependency para filtros de experimentos."""
    return ExperimentFilters(
        status=status,
        drift_level=drift_level,
        search=search
    )