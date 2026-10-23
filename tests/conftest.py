"""
Configuração compartilhada dos testes.

Adiciona ``backend/`` ao ``sys.path`` para que os pacotes ``api``, ``db``,
``drift`` e ``experiments`` sejam importáveis tanto executando o pytest na
raiz do repositório quanto dentro de ``backend/``.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
