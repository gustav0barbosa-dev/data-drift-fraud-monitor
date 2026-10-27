"""
Exceções customizadas da aplicação.
"""
from typing import Any, Optional


class DriftMonitorException(Exception):
    """Exceção base da aplicação."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        detail: Optional[Any] = None
    ):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(self.message)


# ============================================================
# Exceções 4xx
# ============================================================
class BadRequestException(DriftMonitorException):
    """Requisição inválida (400)."""
    
    def __init__(self, message: str, detail: Optional[Any] = None):
        super().__init__(message, status_code=400, detail=detail)


class NotFoundException(DriftMonitorException):
    """Recurso não encontrado (404)."""
    
    def __init__(self, resource: str, resource_id: Any = None):
        if resource_id is not None:
            message = f"{resource} com id '{resource_id}' não encontrado"
        else:
            message = f"{resource} não encontrado"
        super().__init__(message, status_code=404)


class ConflictException(DriftMonitorException):
    """Conflito de recurso (409)."""
    
    def __init__(self, message: str, detail: Optional[Any] = None):
        super().__init__(message, status_code=409, detail=detail)


class ModelNotLoadedException(DriftMonitorException):
    """Modelo não carregado (503)."""
    
    def __init__(self):
        super().__init__(
            message="Modelo não está carregado no servidor",
            status_code=503
        )


class DriftDetectionException(DriftMonitorException):
    """Erro na detecção de drift (500)."""
    
    def __init__(self, detail: str):
        super().__init__(
            message="Erro na detecção de drift",
            status_code=500,
            detail=detail
        )