"""
Dependências compartilhadas da API.
"""
from typing import Generator, Optional
from fastapi import Query
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.config import settings
from ml.predict import MockFraudPredictor
from api.exceptions import ModelNotLoadedException

# Instância única do preditor heurístico (fallback sem artefato treinado).
_mock_predictor: Optional[MockFraudPredictor] = None


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

def get_predictor():
    """
    Obtém o preditor carregado.

    Sem artefato treinado, retorna o preditor heurístico determinístico quando
    ``ALLOW_MOCK_PREDICTIONS`` está ativo (padrão em desenvolvimento). Assim a
    API permanece utilizável antes do pipeline de treinamento da Pessoa 1.
    """
    from api.main import app_state

    if app_state.predictor is not None and app_state.predictor.is_loaded():
        return app_state.predictor

    if settings.ALLOW_MOCK_PREDICTIONS:
        global _mock_predictor
        if _mock_predictor is None:
            _mock_predictor = MockFraudPredictor()
        return _mock_predictor

    raise ModelNotLoadedException()


def get_active_model_version():
    """
    Obtém a versão ativa do modelo registrada no banco.

    Usa o estado carregado no startup (``app_state``) para não consultar o banco
    a cada predição. Retorna ``None`` quando não há métricas persistidas e as
    predições heurísticas estão habilitadas.
    """
    from api.main import app_state

    if app_state.active_model_version is not None:
        return app_state.active_model_version

    if settings.ALLOW_MOCK_PREDICTIONS:
        return None

    raise ModelNotLoadedException()


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