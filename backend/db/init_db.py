"""
Script de inicialização do banco de dados.
Cria tabelas e insere dados iniciais (seed).
"""
import logging
from sqlalchemy.orm import Session

from db.database import engine, SessionLocal, Base, test_connection
from db.models import Experiment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_database():
    """Inicializa o banco de dados."""
    logger.info("🔧 Iniciando banco de dados...")
    
    # Testar conexão
    if not test_connection():
        raise RuntimeError("Não foi possível conectar ao banco")
    
    # Criar tabelas
    logger.info("📦 Criando tabelas...")
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tabelas criadas")
    
    # Inserir dados iniciais
    db = SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()
    
    logger.info("✅ Banco de dados inicializado com sucesso")


def seed_data(db: Session):
    """Insere dados iniciais para testes."""
    logger.info("🌱 Inserindo dados iniciais...")
    
    # Verificar se já existem experimentos
    existing = db.query(Experiment).count()
    if existing > 0:
        logger.info(f"⏭️  Já existem {existing} experimentos. Pulando seed.")
        return
    
    # Criar experimentos padrão
    experiments = [
        Experiment(
            name="E1 - Sem Drift",
            description="Experimento controle sem introdução de data drift",
            drift_level="none",
            status="pending",
            config={"window_size": 10000, "drift_method": "none"}
        ),
        Experiment(
            name="E2 - Drift Moderado",
            description="Experimento com drift moderado nas features",
            drift_level="moderate",
            status="pending",
            config={"window_size": 10000, "drift_method": "moderate"}
        ),
        Experiment(
            name="E3 - Drift Forte",
            description="Experimento com drift forte nas features",
            drift_level="high",
            status="pending",
            config={"window_size": 10000, "drift_method": "high"}
        ),
        Experiment(
            name="E4 - Retreinamento",
            description="Experimento com retreinamento orientado por alertas",
            drift_level="moderate",
            status="pending",
            config={"window_size": 10000, "drift_method": "moderate", "auto_retrain": True}
        ),
    ]
    
    for exp in experiments:
        db.add(exp)
    
    db.commit()
    logger.info(f"✅ {len(experiments)} experimentos criados")


if __name__ == "__main__":
    init_database()