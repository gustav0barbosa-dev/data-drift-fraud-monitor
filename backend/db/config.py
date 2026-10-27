"""
Configurações do banco de dados e da aplicação.
Carrega variáveis de ambiente com Pydantic Settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Configurações da aplicação."""
    
    # Banco de dados
    DATABASE_URL: str = "postgresql://admin:admin123@localhost:5432/drift_monitor"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_VERSION: str = "v1"
    DEBUG: bool = True

    # CORS (lista separada por vírgulas)
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ML
    MODEL_PATH: str = "/app/models"
    DEFAULT_MODEL: str = "xgboost"
    # Quando não há artefato treinado carregado, a API usa um preditor
    # determinístico para manter o dashboard e os testes funcionais.
    ALLOW_MOCK_PREDICTIONS: bool = True
    
    # Drift
    PSI_THRESHOLD: float = 0.25
    KS_PVALUE_THRESHOLD: float = 0.05
    JS_THRESHOLD: float = 0.1
    WASSERSTEIN_THRESHOLD: float = 0.1
    
    # Dataset
    DATASET_PATH: str = "/app/data/paysim.csv"
    
    @property
    def cors_origins(self) -> list[str]:
        """Origens permitidas no CORS."""
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Retorna instância única das configurações."""
    return Settings()


settings = get_settings()