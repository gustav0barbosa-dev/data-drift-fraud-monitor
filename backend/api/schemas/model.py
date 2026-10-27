"""
Schemas Pydantic para versionamento de modelos.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ModelVersionResponse(BaseModel):
    """Metadados de uma versão de modelo treinada (Pessoa 1)."""

    id: int
    experiment_id: int
    version: str
    model_path: str
    model_type: str = "XGBoost"
    hyperparameters: dict[str, Any] = Field(default_factory=dict)
    training_metrics: dict[str, Any] = Field(default_factory=dict)
    trained_at: Optional[datetime] = None
    is_active: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ModelVersionListResponse(BaseModel):
    """Lista de versões de modelo de um experimento."""

    items: list[ModelVersionResponse]
    total: int
    active: Optional[ModelVersionResponse] = None
