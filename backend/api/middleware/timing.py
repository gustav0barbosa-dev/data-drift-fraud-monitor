"""
Middleware de timing de requisições.
Adiciona o header X-Process-Time às respostas.
"""
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class TimingMiddleware(BaseHTTPMiddleware):
    """Adiciona o tempo de processamento ao header da resposta."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
        return response