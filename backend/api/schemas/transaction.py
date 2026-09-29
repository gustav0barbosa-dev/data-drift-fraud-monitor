"""
Schemas Pydantic para transações.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from decimal import Decimal


class TransactionBase(BaseModel):
    """Schema base de transação."""
    step: int = Field(..., ge=0, description="Unidade de tempo (hora)")
    type: str = Field(..., description="Tipo da transação (PAYMENT, TRANSFER, etc.)")
    amount: Decimal = Field(..., ge=0, description="Valor da transação")
    old_balance_org: Optional[Decimal] = Field(None, description="Saldo anterior da origem")
    new_balance_org: Optional[Decimal] = Field(None, description="Saldo posterior da origem")
    old_balance_dest: Optional[Decimal] = Field(None, description="Saldo anterior do destino")
    new_balance_dest: Optional[Decimal] = Field(None, description="Saldo posterior do destino")


class TransactionCreate(TransactionBase):
    """Schema para criação de transação."""
    is_fraud: bool = Field(False, description="Rótulo real de fraude")
    is_flagged_fraud: bool = Field(False, description="Rótulo de fraude sinalizada")


class TransactionResponse(TransactionBase):
    """Schema de resposta de transação."""
    id: int
    is_fraud: bool
    is_flagged_fraud: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionBatch(BaseModel):
    """Schema para lote de transações."""
    transactions: list[TransactionCreate] = Field(..., min_length=1, max_length=1000)