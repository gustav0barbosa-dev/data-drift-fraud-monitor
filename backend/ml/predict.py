"""
Preditor de fraude.
"""
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class FraudPredictor:
    """Preditor de fraude baseado em XGBoost."""
    
    def __init__(self, model_path: str = None):
        self.model = None
        self.model_path = model_path
        self.feature_names = None
        
        if model_path:
            self.load_model(model_path)
    
    def load_model(self, model_path: str) -> None:
        """Carrega modelo do disco."""
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"Modelo não encontrado: {model_path}")
        
        self.model = joblib.load(model_path)
        self.model_path = model_path
        logger.info(f"✅ Modelo carregado: {model_path}")
    
    def is_loaded(self) -> bool:
        """Verifica se modelo está carregado."""
        return self.model is not None
    
    def predict(self, transaction: dict) -> dict:
        """
        Realiza predição de uma transação.
        
        Args:
            transaction: Dicionário com features
            
        Returns:
            dict: {"is_fraud": bool, "probability": float}
        """
        if not self.is_loaded():
            raise RuntimeError("Modelo não carregado")
        
        # Converter para DataFrame
        df = pd.DataFrame([transaction])
        
        # Remover colunas não-features
        drop_cols = ["is_fraud", "is_flagged_fraud", "id", "created_at"]
        df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")
        
        # Predição
        probability = float(self.model.predict_proba(df)[0, 1])
        is_fraud = probability >= 0.5
        
        return {
            "is_fraud": is_fraud,
            "probability": round(probability, 5)
        }
    
    def predict_batch(self, transactions: list[dict]) -> list[dict]:
        """Realiza predição em lote."""
        if not self.is_loaded():
            raise RuntimeError("Modelo não carregado")
        
        df = pd.DataFrame(transactions)
        drop_cols = ["is_fraud", "is_flagged_fraud", "id", "created_at"]
        df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")
        
        probabilities = self.model.predict_proba(df)[:, 1]
        
        return [
            {"is_fraud": bool(p >= 0.5), "probability": round(float(p), 5)}
            for p in probabilities
        ]