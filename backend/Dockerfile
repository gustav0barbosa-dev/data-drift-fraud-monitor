# ============================================================
# Dockerfile - Backend (FastAPI + ML)
# ============================================================
FROM python:3.11-slim

# Metadados
LABEL maintainer="Felipe, Gabriel, Gustavo"
LABEL description="Data Drift Fraud Monitor - Backend"

# Variáveis de ambiente
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar requirements
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copiar código
COPY . .

# Criar diretórios necessários e tornar o entrypoint executável
RUN mkdir -p /app/models /app/data /app/logs && \
    chmod +x /app/entrypoint.sh

# Expor porta
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Entrypoint: espera o banco, aplica migrations e sobe o Uvicorn
CMD ["sh", "/app/entrypoint.sh"]
