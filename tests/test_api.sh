#!/bin/bash
# ============================================================
# Script de teste dos endpoints da API
# ============================================================

BASE_URL="http://localhost:8000"
API_URL="${BASE_URL}/api/v1"

echo "🧪 Testando endpoints da API..."
echo ""

# ---- Health Check ----
echo "1️⃣  Health Check:"
curl -s "${BASE_URL}/health" | jq '.'
echo ""

# ---- Root ----
echo "2️⃣  Root:"
curl -s "${BASE_URL}/" | jq '.'
echo ""

# ---- Criar Experimento ----
echo "3️⃣  Criando experimento:"
EXPERIMENT=$(curl -s -X POST "${API_URL}/experiments/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste API - Sem Drift",
    "description": "Experimento de teste da API",
    "drift_level": "none",
    "config": {"test": true}
  }')
echo "${EXPERIMENT}" | jq '.'
EXPERIMENT_ID=$(echo "${EXPERIMENT}" | jq -r '.id')
echo ""

# ---- Listar Experimentos ----
echo "4️⃣  Listando experimentos:"
curl -s "${API_URL}/experiments/?limit=5" | jq '.'
echo ""

# ---- Obter Experimento ----
echo "5️⃣  Obtendo experimento ${EXPERIMENT_ID}:"
curl -s "${API_URL}/experiments/${EXPERIMENT_ID}" | jq '.'
echo ""

# ---- Atualizar Experimento ----
echo "6️⃣  Atualizando experimento:"
curl -s -X PATCH "${API_URL}/experiments/${EXPERIMENT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"description": "Descrição atualizada"}' | jq '.'
echo ""

# ---- Predição Única ----
echo "7️⃣  Predição única:"
curl -s -X POST "${API_URL}/predict/" \
  -H "Content-Type: application/json" \
  -d '{
    "step": 1,
    "type": "TRANSFER",
    "amount": 5000.00,
    "old_balance_org": 10000.00,
    "new_balance_org": 5000.00,
    "old_balance_dest": 0.00,
    "new_balance_dest": 5000.00,
    "is_fraud": false,
    "is_flagged_fraud": false
  }' | jq '.'
echo ""

# ---- Predição em Lote ----
echo "8️⃣  Predição em lote:"
curl -s -X POST "${API_URL}/predict/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "step": 2, "type": "PAYMENT", "amount": 100.00,
        "old_balance_org": 5000.00, "new_balance_org": 4900.00
      },
      {
        "step": 3, "type": "CASH_OUT", "amount": 200.00,
        "old_balance_org": 4900.00, "new_balance_org": 4700.00
      }
    ]
  }' | jq '.'
echo ""

# ---- Health do Preditor ----
echo "9️⃣  Health do preditor:"
curl -s "${API_URL}/predict/health" | jq '.'
echo ""

# ---- Deletar Experimento ----
echo "🔟 Removendo experimento:"
curl -s -X DELETE "${API_URL}/experiments/${EXPERIMENT_ID}" | jq '.'
echo ""

echo "✅ Testes concluídos!"