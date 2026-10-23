# backend/api/schemas/performance.py
"""
Schemas Pydantic para métricas de desempenho.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PerformanceBase(BaseModel):
    """Schema base de performance."""
    window_start: datetime
    window_end: datetime
    accuracy: Optional[float] = Field(None, ge=0, le=1)
    precision: Optional[float] = Field(None, ge=0, le=1)
    recall: Optional[float] = Field(None, ge=0, le=1)
    f1_score: Optional[float] = Field(None, ge=0, le=1)
    auc_roc: Optional[float] = Field(None, ge=0, le=1)
    total_predictions: int = 0
    true_positives: int = 0
    false_positives: int = 0
    true_negatives: int = 0
    false_negatives: int = 0


class PerformanceResponse(PerformanceBase):
    """Schema de resposta de performance."""
    id: int
    model_version_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class PerformanceSummary(BaseModel):
    """Resumo de performance de um experimento."""
    experiment_id: int
    versions: list[dict]
    best_f1: float
    worst_f1: float
    degradation: float