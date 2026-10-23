"""
Schemas comuns reutilizáveis.
"""
from pydantic import BaseModel, Field
from typing import Generic, TypeVar, List, Optional
from datetime import datetime

T = TypeVar("T")


# ============================================================
# Paginação
# ============================================================
class PaginatedResponse(BaseModel, Generic[T]):
    """Resposta paginada genérica."""
    
    items: List[T] = Field(..., description="Lista de itens")
    total: int = Field(..., description="Total de itens")
    skip: int = Field(..., description="Itens pulados")
    limit: int = Field(..., description="Limite por página")
    has_next: bool = Field(..., description="Existe próxima página")
    has_prev: bool = Field(..., description="Existe página anterior")


# ============================================================
# Erros
# ============================================================
class ErrorResponse(BaseModel):
    """Resposta de erro padronizada."""
    
    error: str = Field(..., description="Tipo do erro")
    message: str = Field(..., description="Mensagem do erro")
    detail: Optional[dict | list | str] = Field(None, description="Detalhes adicionais")
    path: Optional[str] = Field(None, description="Caminho da requisição")
    timestamp: datetime = Field(default_factory=datetime.now)


# ============================================================
# Mensagens
# ============================================================
class MessageResponse(BaseModel):
    """Resposta com mensagem simples."""
    
    message: str = Field(..., description="Mensagem")
    success: bool = Field(True, description="Indica sucesso")


class DeleteResponse(BaseModel):
    """Resposta de exclusão."""
    
    message: str = Field(..., description="Mensagem de confirmação")
    deleted_id: int = Field(..., description="ID do recurso removido")
    success: bool = Field(True, description="Indica sucesso")