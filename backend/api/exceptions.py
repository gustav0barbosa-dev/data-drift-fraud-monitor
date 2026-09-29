"""
Exceções customizadas da aplicação.
"""


class DriftMonitorException(Exception):
    """Exceção base da aplicação."""
    def __init__(self, message: str, status_code: int = 500, detail: str = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(self.message)


class NotFoundException(DriftMonitorException):
    """Recurso não encontrado."""
    def __init__(self, resource: str, resource_id: int):
        super().__init__(
            message=f"{resource} com id {resource_id} não encontrado",
            status_code=404
        )


class ModelNotLoadedException(DriftMonitorException):
    """Modelo não carregado."""
    def __init__(self):
        super().__init__(
            message="Modelo não está carregado",
            status_code=503
        )


class DriftDetectionException(DriftMonitorException):
    """Erro na detecção de drift."""
    def __init__(self, detail: str):
        super().__init__(
            message="Erro na detecção de drift",
            status_code=500,
            detail=detail
        )