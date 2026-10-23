# backend/api/main.py (atualizado)
"""
Aplicação FastAPI principal — com integração ML e Drift.
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging
import time
from pathlib import Path

from api.routes import experiments, predict, drift, retrain, metrics
from api.exceptions import DriftMonitorException
from api.middleware.logging import LoggingMiddleware
from api.middleware.timing import TimingMiddleware
from db.database import test_connection, create_all_tables, SessionLocal
from db.config import settings
from db.models import ModelVersion
from ml.predict import FraudPredictor


logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


# ============================================================
# Estado global da aplicação
# ============================================================
class AppState:
    """Estado global da aplicação."""
    predictor: FraudPredictor = None
    active_model_version: ModelVersion = None


app_state = AppState()


# ============================================================
# Lifespan (startup/shutdown)
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia o ciclo de vida da aplicação."""
    logger.info("🚀 Iniciando Data Drift Fraud Monitor API...")
    
    # Testar conexão com banco
    if not test_connection():
        logger.error("❌ Falha na conexão com banco de dados")
        raise RuntimeError("Banco de dados indisponível")
    
    logger.info("✅ Banco de dados conectado")
    
    # Criar tabelas (em produção usar Alembic)
    if settings.DEBUG:
        create_all_tables()
        logger.info("✅ Tabelas verificadas")
    
    # Carregar modelo ativo
    await _load_active_model()
    
    logger.info("✅ API pronta para receber requisições")
    yield
    logger.info("🛑 Encerrando API...")


async def _load_active_model():
    """Carrega o modelo ativo do banco de dados."""
    db = SessionLocal()
    try:
        active_model = db.query(ModelVersion).filter(
            ModelVersion.is_active == True
        ).first()
        
        if active_model and Path(active_model.model_path).exists():
            predictor = FraudPredictor(active_model.model_path)
            app_state.predictor = predictor
            app_state.active_model_version = active_model
            logger.info(f"✅ Modelo carregado: versão {active_model.version}")
        else:
            logger.warning("⚠️ Nenhum modelo ativo encontrado. Endpoints de predição usarão mock.")
    except Exception as e:
        logger.error(f"❌ Erro ao carregar modelo: {e}")
    finally:
        db.close()


# ============================================================
# Aplicação FastAPI
# ============================================================
app = FastAPI(
    title="Data Drift Fraud Monitor API",
    description="API para monitoramento de Data Drift em detecção de fraudes",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)


# Middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time"],
)
app.add_middleware(LoggingMiddleware)
app.add_middleware(TimingMiddleware)


# Exception handlers
@app.exception_handler(DriftMonitorException)
async def drift_monitor_exception_handler(request: Request, exc: DriftMonitorException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "detail": exc.detail,
            "path": str(request.url)
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "ValidationError",
            "message": "Dados de entrada inválidos",
            "detail": exc.errors()
        }
    )


# Rotas
app.include_router(experiments.router, prefix="/api/v1/experiments", tags=["Experimentos"])
app.include_router(predict.router, prefix="/api/v1/predict", tags=["Predição"])
app.include_router(drift.router, prefix="/api/v1/drift", tags=["Drift"])
app.include_router(retrain.router, prefix="/api/v1/retrain", tags=["Retreinamento"])
app.include_router(metrics.router, prefix="/api/v1/metrics", tags=["Métricas"])


# Health
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Data Drift Fraud Monitor API",
        "version": "1.0.0",
        "status": "healthy",
        "model_loaded": app_state.predictor is not None
    }


@app.get("/health", tags=["Health"])
async def health_check():
    db_status = "connected" if test_connection() else "disconnected"
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": time.time(),
        "components": {
            "database": db_status,
            "api": "running",
            "model": "loaded" if app_state.predictor else "not_loaded"
        },
        "version": "1.0.0"
    }