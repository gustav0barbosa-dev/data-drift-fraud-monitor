"""
Configuração compartilhada dos testes.

Adiciona ``backend/`` ao ``sys.path`` para que os pacotes ``api``, ``db``,
``drift`` e ``experiments`` sejam importáveis tanto executando o pytest na
raiz do repositório quanto dentro de ``backend/``.

Os testes marcados com ``@pytest.mark.db`` exigem um PostgreSQL em execução.
Quando o banco não está acessível eles são **pulados** (em vez de falharem),
para que a suíte continue útil em máquinas sem Docker:

    docker compose up -d db
    pytest
"""
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _database_reachable(timeout: float = 2.0) -> bool:
    """
    Testa a conexão real com o banco configurado.

    Apenas verificar a porta TCP não é suficiente: pode haver outro PostgreSQL
    escutando na 5432 com credenciais/base diferentes das do projeto.
    """
    try:
        from sqlalchemy import create_engine, text

        from db.config import settings

        engine = create_engine(
            settings.DATABASE_URL,
            connect_args={"connect_timeout": int(timeout)},
        )
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:
        return False


def pytest_collection_modifyitems(config, items):
    """Pula os testes de banco quando o PostgreSQL não está disponível."""
    if _database_reachable():
        return

    skip_database = pytest.mark.skip(
        reason="PostgreSQL indisponível — suba o serviço (docker compose up -d db) para rodar este teste"
    )
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip_database)
