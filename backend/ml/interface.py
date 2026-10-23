# backend/ml/interface.py
"""
Contratos (interfaces) do módulo ML.
Define o que a API espera do módulo de Machine Learning.
"""
from typing import Protocol, Any
import pandas as pd
import numpy as np


class FraudPredictorProtocol(Protocol):
    """Interface do preditor de fraude."""
    
    def predict(self, transaction: dict) -> dict:
        """
        Realiza predição de uma transação.
        
        Args:
            transaction: Dicionário com features da transação
            
        Returns:
            dict: {"is_fraud": bool, "probability": float}
        """
        ...
    
    def predict_batch(self, transactions: list[dict]) -> list[dict]:
        """Realiza predição em lote."""
        ...
    
    def load_model(self, model_path: str) -> None:
        """Carrega modelo do disco."""
        ...
    
    def is_loaded(self) -> bool:
        """Verifica se modelo está carregado."""
        ...


class ModelTrainerProtocol(Protocol):
    """Interface do treinador de modelo."""
    
    def train(self, X: pd.DataFrame, y: pd.Series, **kwargs) -> dict:
        """
        Treina um modelo.
        
        Returns:
            dict: {"model_path": str, "metrics": dict}
        """
        ...
    
    def evaluate(self, X: pd.DataFrame, y: pd.Series) -> dict:
        """Avalia o modelo."""
        ...