"""
Schemas Pydantic para transações.
"""
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from decimal import Decimal
from typing import Optional, Literal


# ============================================================
# Base
# ============================================================
class TransactionBase(BaseModel):
    """Schema base de transação."""
    
    step: int = Field(..., ge=0, description="Unidade de tempo (hora)")
    type: Literal[
        "PAYMENT", "TRANSFER", "CASH_OUT", "CASH_IN", "DEBIT"
    ] = Field(..., description="Tipo da transação")
    amount: Decimal = Field(..., ge=0, description="Valor da transação")
    old_balance_org: Optional[Decimal] = Field(None, ge=0)
    new_balance_org: Optional[Decimal] = Field(None, ge=0)
    old_balance_dest: Optional[Decimal] = Field(None, ge=0)
    new_balance_dest: Optional[Decimal] = Field(None, ge=0)


# ============================================================
# Criação
# ============================================================
class TransactionCreate(TransactionBase):
    """Schema para criação de transação."""
    
    is_fraud: bool = Field(False, description="Rótulo real de fraude")
    is_flagged_fraud: bool = Field(False, description="Fraude sinalizada pelo sistema")


class TransactionBatchCreate(BaseModel):
    """Schema para lote de transações."""
    
    transactions: list[TransactionCreate] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Lista de transações (máx. 1000)"
    )


# ============================================================
# Resposta
# ============================================================
class TransactionResponse(TransactionBase):
    """Schema de resposta de transação."""
    
    id: int
    is_fraud: bool
    is_flagged_fraud: bool
    created_at: datetime
    
    class Config:
        from_attributes = True