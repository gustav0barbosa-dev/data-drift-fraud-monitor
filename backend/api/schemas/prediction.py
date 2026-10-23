"""
Schemas Pydantic para predições.
"""
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from decimal import Decimal


# ============================================================
# Resposta
# ============================================================
class PredictionResponse(BaseModel):
    """Schema de resposta de predição."""
    
    id: int
    transaction_id: int
    is_fraud: bool = Field(..., description="Classificação binária")
    probability: Decimal = Field(
        ...,
        ge=0,
        le=1,
        description="Probabilidade de fraude (0-1)"
    )
    latency_ms: Decimal = Field(..., description="Latência da predição em ms")
    predicted_at: datetime
    
    class Config:
        from_attributes = True


class PredictionBatchItem(BaseModel):
    """Item individual de predição em lote."""
    
    transaction_id: int
    is_fraud: bool
    probability: Decimal


class PredictionBatchResponse(BaseModel):
    """Schema de resposta de predição em lote."""
    
    total: int = Field(..., description="Total de predições")
    predictions: list[PredictionBatchItem]
    total_latency_ms: Decimal = Field(..., description="Latência total")
    avg_latency_ms: Decimal = Field(..., description="Latência média")