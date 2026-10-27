"""
Pré-processamento e engenharia de features (T1.2).

As features usadas pelo modelo baseline (9, na mesma ordem exibida no
dashboard) são::

    amount, old_balance_org, new_balance_org, old_balance_dest,
    new_balance_dest, balance_diff_org, balance_diff_dest, amount_ratio, type

``type`` é codificado de forma ordinal com um mapa fixo (o XGBoost lida bem com
variáveis categóricas de baixa cardinalidade). O mesmo módulo é usado no treino
e na inferência, garantindo que a API aplique exatamente a mesma transformação
do artefato treinado.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import pandas as pd

from data.loader import standardize_columns

# Mapa fixo: nunca reordene (faz parte do contrato do artefato salvo).
TYPE_CODES = {
    "PAYMENT": 0,
    "TRANSFER": 1,
    "CASH_OUT": 2,
    "CASH_IN": 3,
    "DEBIT": 4,
}

FEATURES: list[str] = [
    "amount",
    "old_balance_org",
    "new_balance_org",
    "old_balance_dest",
    "new_balance_dest",
    "balance_diff_org",
    "balance_diff_dest",
    "amount_ratio",
    "type",
]

TARGET = "is_fraud"


@dataclass(frozen=True)
class DatasetSplit:
    """Resultado do split temporal com features já construídas."""

    X_train: pd.DataFrame
    y_train: pd.Series
    X_test: pd.DataFrame
    y_test: pd.Series
    train_rows: int
    test_rows: int
    train_fraud_rate: float
    test_fraud_rate: float
    split_step: int

    def summary(self) -> dict:
        return {
            "train_rows": self.train_rows,
            "test_rows": self.test_rows,
            "train_fraud_rate": round(float(self.train_fraud_rate), 6),
            "test_fraud_rate": round(float(self.test_fraud_rate), 6),
            "split_step": int(self.split_step),
        }


def encode_type(values: pd.Series) -> pd.Series:
    """Codifica o tipo da transação com o mapa fixo ``TYPE_CODES``."""
    if pd.api.types.is_numeric_dtype(values):
        return values.astype(float)

    normalized = values.astype(str).str.upper().str.strip()
    unknown = ~normalized.isin(TYPE_CODES)
    if unknown.any():
        # Valores fora do contrato viram PAYMENT (0) em vez de quebrar a API.
        normalized = normalized.where(~unknown, "PAYMENT")
    return normalized.map(TYPE_CODES).astype(float)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Constrói a matriz de features a partir de transações cruas.

    Aceita tanto o snake_case interno quanto o camelCase original do PaySim.
    Não altera o DataFrame recebido.
    """
    missing = {"step", "type", "amount"} - set(df.columns)
    if missing:
        # ``standardize_columns`` também renomeia amount/type (já no contrato).
        raise ValueError(f"Colunas obrigatórias ausentes: {sorted(missing)}")

    frame = df.rename(columns={"isFraud": TARGET}).copy()

    for column in (
        "amount",
        "old_balance_org",
        "new_balance_org",
        "old_balance_dest",
        "new_balance_dest",
    ):
        if column not in frame.columns:
            frame[column] = 0.0
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0.0)

    features = pd.DataFrame(index=frame.index)
    features["amount"] = frame["amount"].astype(float)
    features["old_balance_org"] = frame["old_balance_org"].astype(float)
    features["new_balance_org"] = frame["new_balance_org"].astype(float)
    features["old_balance_dest"] = frame["old_balance_dest"].astype(float)
    features["new_balance_dest"] = frame["new_balance_dest"].astype(float)
    features["balance_diff_org"] = (
        features["old_balance_org"] - features["new_balance_org"]
    )
    features["balance_diff_dest"] = (
        features["new_balance_dest"] - features["old_balance_dest"]
    )
    features["amount_ratio"] = features["amount"] / (
        features["old_balance_org"].abs() + 1.0
    )
    features["type"] = encode_type(frame["type"])

    return features[FEATURES]


def build_labels(df: pd.DataFrame) -> pd.Series:
    """Extrai o rótulo real (``is_fraud``) como série booleana."""
    if TARGET not in df.columns:
        raise ValueError(f"Coluna de rótulo '{TARGET}' ausente")
    return df[TARGET].fillna(False).astype(bool)


def temporal_split(
    df: pd.DataFrame,
    *,
    train_ratio: float = 0.7,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Divide o dataset por tempo (nunca aleatoriamente).

    O corte é feito pelo índice ordenado de ``step``, garantindo que o teste
    represente o futuro em relação ao treino.
    """
    if not 0.0 < train_ratio < 1.0:
        raise ValueError("train_ratio deve estar em (0, 1)")
    if len(df) < 2:
        raise ValueError("Dataset precisa de pelo menos 2 linhas")

    ordered = df.sort_values("step", kind="stable").reset_index(drop=True)
    split_index = int(len(ordered) * train_ratio)
    split_index = min(max(split_index, 1), len(ordered) - 1)

    return ordered.iloc[:split_index].copy(), ordered.iloc[split_index:].copy()


def prepare_dataset(
    df: pd.DataFrame,
    *,
    train_ratio: float = 0.7,
) -> DatasetSplit:
    """Normaliza, divide temporalmente e constrói X/y de treino e teste."""
    normalized = standardize_columns(df)
    train, test = temporal_split(normalized, train_ratio=train_ratio)

    X_train = build_features(train)
    y_train = build_labels(train)
    X_test = build_features(test)
    y_test = build_labels(test)

    return DatasetSplit(
        X_train=X_train,
        y_train=y_train,
        X_test=X_test,
        y_test=y_test,
        train_rows=len(train),
        test_rows=len(test),
        train_fraud_rate=float(y_train.mean()),
        test_fraud_rate=float(y_test.mean()),
        split_step=int(train["step"].max()),
    )


def ensure_feature_columns(frame: pd.DataFrame, features: Sequence[str] = FEATURES) -> pd.DataFrame:
    """Garante a ordem e a presença das features esperadas pelo artefato."""
    missing = [column for column in features if column not in frame.columns]
    if missing:
        raise ValueError(f"Features ausentes: {missing}")
    return frame[list(features)]
