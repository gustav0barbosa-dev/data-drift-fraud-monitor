#!/bin/bash
# ============================================================
# Script de setup do projeto
# ============================================================

set -e

echo "🚀 Iniciando setup do Data Drift Fraud Monitor..."

# 1. Copiar .env.example para .env
if [ ! -f .env ]; then
    echo "📋 Criando .env a partir de .env.example..."
    cp .env.example .env
    echo "✅ .env criado"
else
    echo "⏭️  .env já existe"
fi

# 2. Criar diretórios necessários
echo "📁 Criando diretórios..."
mkdir -p data models logs
echo "✅ Diretórios criados"

# 3. Build dos containers
echo "🐳 Construindo containers..."
docker-compose build

# 4. Subir os serviços
echo "🚀 Subindo serviços..."
docker-compose up -d

# 5. Aguardar o banco ficar saudável
echo "⏳ Aguardando banco de dados..."
sleep 15

# 6. Inicializar banco
echo "🗄️  Inicializando banco de dados..."
docker-compose exec -T backend python -m db.init_db

# 7. Verificar status
echo "📊 Status dos serviços:"
docker-compose ps

echo ""
echo "✅ Setup concluído!"
echo ""
echo "🌐 Acesse:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   Docs:     http://localhost:8000/docs"
echo "   PgAdmin:  http://localhost:5050 (perfil 'tools')"