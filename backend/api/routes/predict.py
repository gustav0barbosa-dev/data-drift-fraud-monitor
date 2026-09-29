"""
Endpoints de predição de fraude.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import time

from api.dependencies import get_db
from api.schemas.transaction import TransactionCreate, TransactionResponse, TransactionBatch
from api.schemas.prediction import PredictionResponse, PredictionBatchResponse
from api.exceptions import ModelNotLoadedException
from ml.predict import FraudPredictor
from db.models import Transaction, Prediction, ModelVersion

router = APIRouter()

# Instância global do preditor (carregada no startup)
predictor: FraudPredictor = None


def get_predictor() -> FraudPredictor:
    """Obtém o preditor carregado."""
    if predictor is None:
        raise ModelNotLoadedException()
    return predictor


@router.post("/", response_model=PredictionResponse)
async def predict_single(
    transaction: TransactionCreate,
    db: Session = Depends(get_db),
    pred: FraudPredictor = Depends(get_predictor)
):
    """
    Realiza a predição de fraude para uma única transação.
    """
    start_time = time.time()
    
    # Salvar transação no banco
    db_transaction = Transaction(**transaction.model_dump())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    
    # Realizar predição
    result = pred.predict(transaction.model_dump())
    
    # Calcular latência
    latency_ms = (time.time() - start_time) * 1000
    
    # Salvar predição
    active_model = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()
    if not active_model:
        raise HTTPException(status_code=503, detail="Nenhum modelo ativo encontrado")
    
    db_prediction = Prediction(
        model_version_id=active_model.id,
        transaction_id=db_transaction.id,
        is_fraud=result["is_fraud"],
        probability=result["probability"],
        latency_ms=latency_ms
    )
    db.add(db_prediction)
    db.commit()
    db.refresh(db_prediction)
    
    return PredictionResponse(
        id=db_prediction.id,
        transaction_id=db_transaction.id,
        is_fraud=result["is_fraud"],
        probability=result["probability"],
        latency_ms=latency_ms,
        predicted_at=db_prediction.predicted_at
    )


@router.post("/batch", response_model=PredictionBatchResponse)
async def predict_batch(
    batch: TransactionBatch,
    db: Session = Depends(get_db),
    pred: FraudPredictor = Depends(get_predictor)
):
    """
    Realiza predições em lote.
    """
    start_time = time.time()
    results = []
    
    active_model = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()
    if not active_model:
        raise HTTPException(status_code=503, detail="Nenhum modelo ativo encontrado")
    
    for transaction in batch.transactions:
        # Salvar transação
        db_transaction = Transaction(**transaction.model_dump())
        db.add(db_transaction)
        db.flush()
        
        # Predição
        result = pred.predict(transaction.model_dump())
        
        db_prediction = Prediction(
            model_version_id=active_model.id,
            transaction_id=db_transaction.id,
            is_fraud=result["is_fraud"],
            probability=result["probability"]
        )
        db.add(db_prediction)
        
        results.append({
            "transaction_id": db_transaction.id,
            "is_fraud": result["is_fraud"],
            "probability": result["probability"]
        })
    
    db.commit()
    total_latency = (time.time() - start_time) * 1000
    
    return PredictionBatchResponse(
        total=len(results),
        predictions=results,
        total_latency_ms=total_latency,
        avg_latency_ms=total_latency / len(results)
    )