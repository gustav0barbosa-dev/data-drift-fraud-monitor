"""
Configuração da conexão com o banco de dados PostgreSQL.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool
import logging

from db.config import settings

logger = logging.getLogger(__name__)

# Engine do SQLAlchemy
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    poolclass=QueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,  # Verifica conexão antes de usar
    pool_recycle=3600,   # Recicla conexões a cada 1 hora
    future=True
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True
)

# Base para os modelos
Base = declarative_base()


def get_db():
    """
    Dependency para obter sessão do banco.
    Uso: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_connection() -> bool:
    """Testa a conexão com o banco."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✅ Conexão com o banco estabelecida")
        return True
    except Exception as e:
        logger.error(f"❌ Erro ao conectar ao banco: {e}")
        return False


def create_all_tables():
    """Cria todas as tabelas definidas nos modelos."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Tabelas criadas/verificadas com sucesso")
    except Exception as e:
        logger.error(f"❌ Erro ao criar tabelas: {e}")
        raise


def drop_all_tables():
    """Remove todas as tabelas (uso apenas em desenvolvimento)."""
    if not settings.DEBUG:
        raise RuntimeError("drop_all_tables só pode ser usado em modo DEBUG")
    Base.metadata.drop_all(bind=engine)
    logger.warning("⚠️ Todas as tabelas foram removidas")