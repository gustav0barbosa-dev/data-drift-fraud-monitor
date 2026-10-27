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


class MockFraudPredictor:
    """
    Preditor determinístico usado quando nenhum artefato treinado está disponível.

    Não substitui o modelo real: existe para que a API, o dashboard e os testes
    continuem funcionais em ambientes sem o pipeline de treinamento (Pessoa 1).
    A probabilidade é uma heurística estável baseada em sinais conhecidos de
    fraude do PaySim (tipo da transação, valor e variação de saldo).
    """

    model = None
    feature_names = None
    mode = "mock"

    # Peso por tipo de transação observado no PaySim.
    _TYPE_WEIGHTS = {
        "TRANSFER": 0.35,
        "CASH_OUT": 0.30,
        "PAYMENT": 0.05,
        "CASH_IN": 0.02,
        "DEBIT": 0.03,
    }

    def __init__(self, model_path: str = "mock://heuristic"):
        self.model_path = model_path

    def is_loaded(self) -> bool:
        """O preditor mock está sempre disponível."""
        return True

    def load_model(self, model_path: str) -> None:  # pragma: no cover - no-op
        """Compatibilidade de interface."""
        self.model_path = model_path

    def _probability(self, transaction: dict) -> float:
        transaction_type = str(transaction.get("type") or "PAYMENT").upper()
        weight = self._TYPE_WEIGHTS.get(transaction_type, 0.08)

        try:
            amount = float(transaction.get("amount") or 0.0)
        except (TypeError, ValueError):
            amount = 0.0

        # Valores altos aumentam o risco em escala logarítmica (satura em 1).
        amount_signal = min(1.0, np.log1p(max(amount, 0.0)) / np.log1p(1_000_000))

        # Conta zerada após a transação é um forte indício de fraude no PaySim.
        drained = 0.0
        new_balance = transaction.get("new_balance_org")
        if new_balance is not None:
            try:
                drained = 0.25 if float(new_balance) <= 0 else 0.0
            except (TypeError, ValueError):
                drained = 0.0

        probability = 0.02 + 0.55 * weight + 0.35 * amount_signal + drained
        return float(min(0.995, max(0.001, probability)))

    def predict(self, transaction: dict) -> dict:
        """Predição heurística determinística."""
        probability = self._probability(transaction)
        return {
            "is_fraud": probability >= 0.5,
            "probability": round(probability, 5),
            "mode": "mock",
        }

    def predict_batch(self, transactions: list[dict]) -> list[dict]:
        """Predição heurística em lote."""
        return [self.predict(transaction) for transaction in transactions]