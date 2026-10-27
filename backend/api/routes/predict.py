# backend/api/routes/predict.py
"""
Endpoints de predição — integrado com modelo real e fallback heurístico.
"""
from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_predictor, get_active_model_version
from api.schemas.transaction import TransactionCreate, TransactionBatchCreate
from api.schemas.prediction import (
    PredictionBatchItem,
    PredictionBatchResponse,
    PredictionResponse,
)
from db.models import ModelVersion, Prediction, Transaction

router = APIRouter()


def _mode(predictor, active_model: ModelVersion | None) -> str:
    """Indica se o scoring veio do artefato treinado ou do fallback."""
    if active_model is None or getattr(predictor, "mode", "model") == "mock":
        return "mock"
    return "model"


@router.post(
    "/",
    response_model=PredictionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Predição única",
    description=(
        "Realiza predição de fraude usando o modelo ativo. Sem artefato "
        "treinado, usa o preditor heurístico determinístico (modo mock)."
    ),
)
async def predict_single(
    transaction: TransactionCreate,
    db: Session = Depends(get_db),
    predictor=Depends(get_predictor),
    active_model: ModelVersion | None = Depends(get_active_model_version),
):
    """Realiza predição de uma única transação."""
    start_time = time.time()

    # Salvar transação
    db_transaction = Transaction(**transaction.model_dump())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)

    # Predição (modelo real ou heurística)
    try:
        result = predictor.predict(transaction.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na predição: {str(e)}")

    latency_ms = (time.time() - start_time) * 1000

    prediction_id = None
    predicted_at = datetime.now(timezone.utc)

    # Persistir a predição apenas quando existe uma versão de modelo registrada,
    # pois a tabela `predictions` exige model_version_id.
    if active_model is not None:
        db_prediction = Prediction(
            model_version_id=active_model.id,
            transaction_id=db_transaction.id,
            is_fraud=result["is_fraud"],
            probability=result["probability"],
            latency_ms=round(latency_ms, 2),
        )
        db.add(db_prediction)
        db.commit()
        db.refresh(db_prediction)
        prediction_id = db_prediction.id
        predicted_at = db_prediction.predicted_at or predicted_at

    return PredictionResponse(
        id=prediction_id,
        transaction_id=db_transaction.id,
        is_fraud=result["is_fraud"],
        probability=result["probability"],
        latency_ms=round(latency_ms, 2),
        predicted_at=predicted_at,
        mode=_mode(predictor, active_model),
    )


@router.post(
    "/batch",
    response_model=PredictionBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Predição em lote",
)
async def predict_batch(
    batch: TransactionBatchCreate,
    db: Session = Depends(get_db),
    predictor=Depends(get_predictor),
    active_model: ModelVersion | None = Depends(get_active_model_version),
):
    """Realiza predições em lote."""
    start_time = time.time()

    # Salvar transações
    db_transactions = []
    for item in batch.transactions:
        db_transaction = Transaction(**item.model_dump())
        db.add(db_transaction)
        db_transactions.append(db_transaction)
    db.flush()

    # Predição em lote (modelo real ou heurística)
    try:
        results = predictor.predict_batch([t.model_dump() for t in batch.transactions])
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro na predição: {str(e)}")

    predictions = []
    for db_transaction, result in zip(db_transactions, results):
        if active_model is not None:
            db.add(
                Prediction(
                    model_version_id=active_model.id,
                    transaction_id=db_transaction.id,
                    is_fraud=result["is_fraud"],
                    probability=result["probability"],
                )
            )
        predictions.append(
            PredictionBatchItem(
                transaction_id=db_transaction.id,
                is_fraud=result["is_fraud"],
                probability=result["probability"],
            )
        )

    db.commit()

    total_latency = (time.time() - start_time) * 1000

    return PredictionBatchResponse(
        total=len(predictions),
        predictions=predictions,
        total_latency_ms=round(total_latency, 2),
        avg_latency_ms=round(total_latency / max(len(predictions), 1), 2),
        mode=_mode(predictor, active_model),
    )


@router.get("/health", summary="Health do preditor")
async def predictor_health(predictor=Depends(get_predictor)):
    """Verifica status do preditor."""
    return {
        "status": "ready" if predictor.is_loaded() else "not_loaded",
        "mode": getattr(predictor, "mode", "model"),
        "model_path": predictor.model_path,
    }
