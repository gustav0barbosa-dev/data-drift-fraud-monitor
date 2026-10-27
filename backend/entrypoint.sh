#!/bin/sh
# ============================================================
# Entrypoint do backend
# - aguarda o PostgreSQL
# - aplica migrations (Alembic)
# - opcionalmente insere dados de demonstração
# - inicia o Uvicorn
# ============================================================
set -e

echo "⏳ Aguardando PostgreSQL em ${DATABASE_URL:-<default>}..."

python - <<'PY'
import os
import sys
import time

from sqlalchemy import text

from db.database import engine

attempts = int(os.environ.get("DB_WAIT_ATTEMPTS", "30"))
delay = float(os.environ.get("DB_WAIT_DELAY", "2"))

for attempt in range(1, attempts + 1):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"✅ Banco disponível (tentativa {attempt})")
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - apenas log
        print(f"   tentativa {attempt}/{attempts} falhou: {exc}")
        time.sleep(delay)

print("❌ Banco de dados indisponível")
sys.exit(1)
PY

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "🗂️  Aplicando migrations (alembic upgrade head)..."
  alembic upgrade head
fi

if [ "${SEED_DATABASE:-true}" = "true" ]; then
  echo "🌱 Verificando dados iniciais..."
  python -m db.init_db || echo "⚠️  Seed ignorado (verifique os logs acima)"
fi

HOST="${API_HOST:-0.0.0.0}"
PORT="${API_PORT:-8000}"

if [ "${RELOAD:-false}" = "true" ]; then
  echo "🚀 Uvicorn com hot-reload em ${HOST}:${PORT}"
  exec uvicorn api.main:app --host "$HOST" --port "$PORT" --reload
fi

echo "🚀 Uvicorn em ${HOST}:${PORT}"
exec uvicorn api.main:app --host "$HOST" --port "$PORT" --proxy-headers
