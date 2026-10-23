"""
Schemas Pydantic para experimentos.
"""
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, Literal


# ============================================================
# Base
# ============================================================
class ExperimentBase(BaseModel):
    """Schema base de experimento."""
    
    name: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Nome único do experimento"
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Descrição detalhada do experimento"
    )
    drift_level: Literal["none", "low", "moderate", "high"] = Field(
        ...,
        description="Nível de drift do experimento"
    )
    config: dict = Field(
        default_factory=dict,
        description="Configurações adicionais do experimento"
    )


# ============================================================
# Criação
# ============================================================
class ExperimentCreate(ExperimentBase):
    """Schema para criação de experimento."""
    
    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Nome não pode ser vazio")
        return v.strip()


# ============================================================
# Atualização
# ============================================================
class ExperimentUpdate(BaseModel):
    """Schema para atualização parcial de experimento."""
    
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[Literal["pending", "running", "completed", "failed"]] = None
    config: Optional[dict] = None


# ============================================================
# Resposta
# ============================================================
class ExperimentResponse(ExperimentBase):
    """Schema de resposta de experimento."""
    
    id: int
    status: Literal["pending", "running", "completed", "failed"]
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ExperimentListResponse(BaseModel):
    """Schema de resposta de lista de experimentos."""
    
    items: list[ExperimentResponse]
    total: int
    skip: int
    limit: int
    has_next: bool
    has_prev: bool