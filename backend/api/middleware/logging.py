"""
Middleware de logging de requisições.
"""
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("api.requests")


class LoggingMiddleware(BaseHTTPMiddleware):
    """Registra informações de cada requisição."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Log da requisição
        logger.info(
            f"→ {request.method} {request.url.path} "
            f"| Client: {request.client.host if request.client else 'unknown'}"
        )
        
        # Processar requisição
        response = await call_next(request)
        
        # Log da resposta
        process_time = (time.time() - start_time) * 1000
        logger.info(
            f"← {request.method} {request.url.path} "
            f"| Status: {response.status_code} "
            f"| Time: {process_time:.2f}ms"
        )
        
        return response