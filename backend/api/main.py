"""
Aplicação FastAPI para plataforma de monitoramento de Data Drift.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from api.routes import predict, drift, retrain, metrics, experiments
from api.exceptions import DriftMonitorException
from db.database import engine, Base

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia o ciclo de vida da aplicação."""
    logger.info("🚀 Iniciando Data Drift Fraud Monitor API...")
    # Criar tabelas (em produção, usar Alembic)
    Base.metadata.create_all(bind=engine)
    yield
    logger.info("🛑 Encerrando API...")


app = FastAPI(
    title="Data Drift Fraud Monitor API",
    description="API para monitoramento de Data Drift em modelos de detecção de fraudes",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handler global
@app.exception_handler(DriftMonitorException)
async def drift_monitor_exception_handler(request, exc: DriftMonitorException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "detail": exc.detail}
    )

# Registrar rotas
app.include_router(predict.router, prefix="/api/v1/predict", tags=["Predição"])
app.include_router(drift.router, prefix="/api/v1/drift", tags=["Drift"])
app.include_router(retrain.router, prefix="/api/v1/retrain", tags=["Retreinamento"])
app.include_router(metrics.router, prefix="/api/v1/metrics", tags=["Métricas"])
app.include_router(experiments.router, prefix="/api/v1/experiments", tags=["Experimentos"])


@app.get("/", tags=["Health"])
async def root():
    """Endpoint de health check."""
    return {
        "status": "healthy",
        "service": "Data Drift Fraud Monitor API",
        "version": "1.0.0"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check detalhado."""
    return {
        "status": "healthy",
        "database": "connected",
        "model": "loaded"
    }