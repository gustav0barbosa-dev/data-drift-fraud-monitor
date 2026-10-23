# backend/api/routes/predict.py (atualizado)
"""
Endpoints de predição — integrado com modelo real.
"""
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
import time

from api.dependencies import get_db, get_predictor, get_active_model_version
from api.schemas.transaction import TransactionCreate, TransactionBatchCreate
from api.schemas.prediction import (
    PredictionResponse,
    PredictionBatchResponse,
    PredictionBatchItem
)
from ml.predict import FraudPredictor
from db.models import Transaction, Prediction, ModelVersion

router = APIRouter()


@router.post(
    "/",
    response_model=PredictionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Predição única",
    description="Realiza predição de fraude usando o modelo ativo."
)
async def predict_single(
    transaction: TransactionCreate,
    db: Session = Depends(get_db),
    predictor: FraudPredictor = Depends(get_predictor),
    active_model: ModelVersion = Depends(get_active_model_version)
):
    """Realiza predição de uma única transação."""
    start_time = time.time()
    
    # Salvar transação
    db_transaction = Transaction(**transaction.model_dump())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    
    # Predição real
    try:
        result = predictor.predict(transaction.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na predição: {str(e)}")
    
    latency_ms = (time.time() - start_time) * 1000
    
    # Salvar predição
    db_prediction = Prediction(
        model_version_id=active_model.id,
        transaction_id=db_transaction.id,
        is_fraud=result["is_fraud"],
        probability=result["probability"],
        latency_ms=round(latency_ms, 2)
    )
    db.add(db_prediction)
    db.commit()
    db.refresh(db_prediction)
    
    return PredictionResponse(
        id=db_prediction.id,
        transaction_id=db_transaction.id,
        is_fraud=result["is_fraud"],
        probability=result["probability"],
        latency_ms=round(latency_ms, 2),
        predicted_at=db_prediction.predicted_at
    )


@router.post(
    "/batch",
    response_model=PredictionBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Predição em lote"
)
async def predict_batch(
    batch: TransactionBatchCreate,
    db: Session = Depends(get_db),
    predictor: FraudPredictor = Depends(get_predictor),
    active_model: ModelVersion = Depends(get_active_model_version)
):
    """Realiza predições em lote."""
    start_time = time.time()
    
    # Salvar transações
    db_transactions = []
    for t in batch.transactions:
        db_t = Transaction(**t.model_dump())
        db.add(db_t)
        db_transactions.append(db_t)
    db.flush()
    
    # Predição em lote
    try:
        results = predictor.predict_batch([t.model_dump() for t in batch.transactions])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na predição: {str(e)}")
    
    # Salvar predições
    predictions = []
    for db_t, result in zip(db_transactions, results):
        db_p = Prediction(
            model_version_id=active_model.id,
            transaction_id=db_t.id,
            is_fraud=result["is_fraud"],
            probability=result["probability"]
        )
        db.add(db_p)
        predictions.append(PredictionBatchItem(
            transaction_id=db_t.id,
            is_fraud=result["is_fraud"],
            probability=result["probability"]
        ))
    
    db.commit()
    
    total_latency = (time.time() - start_time) * 1000
    
    return PredictionBatchResponse(
        total=len(predictions),
        predictions=predictions,
        total_latency_ms=round(total_latency, 2),
        avg_latency_ms=round(total_latency / len(predictions), 2)
    )


@router.get("/health", summary="Health do preditor")
async def predictor_health(
    predictor: FraudPredictor = Depends(get_predictor)
):
    """Verifica status do preditor."""
    return {
        "status": "ready" if predictor.is_loaded() else "not_loaded",
        "model_path": predictor.model_path
    }