"""
Métricas de desempenho do modelo (T1.6).

As métricas exigidas pelo PDF — Accuracy, Precision, Recall, F1 e AUC-ROC — são
calculadas com o scikit-learn. ``pr_auc`` (average precision) é incluída por ser
mais informativa em bases desbalanceadas como o PaySim.

Todas as funções aceitam ``y_true`` booleano/0-1 e ``y_score`` com a
probabilidade da classe fraude.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional, Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from ml.model import DECISION_THRESHOLD

METRIC_NAMES = (
    "accuracy",
    "precision",
    "recall",
    "f1",
    "auc_roc",
    "pr_auc",
)


def classification_metrics(
    y_true: Sequence | np.ndarray,
    y_score: Sequence | np.ndarray,
    *,
    threshold: float = DECISION_THRESHOLD,
) -> dict[str, Any]:
    """
    Calcula as métricas de classificação.

    Returns:
        dict com ``accuracy``, ``precision``, ``recall``, ``f1``, ``auc_roc``,
        ``pr_auc``, ``threshold``, a matriz de confusão (TP/FP/TN/FN) e
        ``total``/``fraud_rate``. ``auc_roc``/``pr_auc`` são ``None`` quando a
        janela tem apenas uma classe (métrica indefinida).
    """
    true = np.asarray(y_true).astype(int).ravel()
    score = np.asarray(y_score, dtype=float).ravel()

    if true.size != score.size:
        raise ValueError("y_true e y_score precisam ter o mesmo tamanho")

    total = int(true.size)
    if total == 0:
        return {
            "accuracy": None,
            "precision": None,
            "recall": None,
            "f1": None,
            "auc_roc": None,
            "pr_auc": None,
            "threshold": float(threshold),
            "total": 0,
            "fraud_rate": 0.0,
            "true_positives": 0,
            "false_positives": 0,
            "true_negatives": 0,
            "false_negatives": 0,
        }

    predicted = (score >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(true, predicted, labels=[0, 1]).ravel()

    has_both_classes = len(np.unique(true)) > 1
    auc_roc = float(roc_auc_score(true, score)) if has_both_classes else None
    pr_auc = float(average_precision_score(true, score)) if true.sum() > 0 else None

    return {
        "accuracy": round(float(accuracy_score(true, predicted)), 6),
        "precision": round(
            float(precision_score(true, predicted, zero_division=0)), 6
        ),
        "recall": round(float(recall_score(true, predicted, zero_division=0)), 6),
        "f1": round(float(f1_score(true, predicted, zero_division=0)), 6),
        "auc_roc": round(auc_roc, 6) if auc_roc is not None else None,
        "pr_auc": round(pr_auc, 6) if pr_auc is not None else None,
        "threshold": round(float(threshold), 4),
        "total": total,
        "fraud_rate": round(float(true.mean()), 6),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn),
    }


def aggregate_metrics(windows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """
    Média das métricas por janela (ignora valores indefinidos).

    Também devolve o desvio-padrão do F1, útil para medir estabilidade.
    """
    rows = [
        window.get("metrics", window)
        for window in windows
        if window.get("metrics", window)
    ]
    if not rows:
        return {name: None for name in METRIC_NAMES} | {"windows": 0}

    aggregated: dict[str, Any] = {}
    for name in METRIC_NAMES:
        values = [
            row[name]
            for row in rows
            if row.get(name) is not None
        ]
        aggregated[name] = round(float(np.mean(values)), 6) if values else None

    f1_values = [row["f1"] for row in rows if row.get("f1") is not None]
    aggregated["f1_std"] = round(float(np.std(f1_values)), 6) if f1_values else None
    aggregated["windows"] = len(rows)
    return aggregated


def find_best_threshold(
    y_true: Sequence | np.ndarray,
    y_score: Sequence | np.ndarray,
    *,
    grid: Optional[Sequence[float]] = None,
) -> dict[str, Any]:
    """
    Varre limiares e devolve o de maior F1.

    Não altera o limiar operacional do sistema (0,5); serve para relatório e
    para justificar a escolha em bases desbalanceadas.
    """
    true = np.asarray(y_true).astype(int).ravel()
    score = np.asarray(y_score, dtype=float).ravel()
    if true.size == 0:
        return {"threshold": DECISION_THRESHOLD, "f1": None, "precision": None, "recall": None}

    thresholds = list(grid) if grid is not None else np.arange(0.05, 0.96, 0.05)
    best: dict[str, Any] = {
        "threshold": DECISION_THRESHOLD,
        "f1": -1.0,
        "precision": 0.0,
        "recall": 0.0,
    }

    for threshold in thresholds:
        metrics = classification_metrics(true, score, threshold=float(threshold))
        if (metrics["f1"] or 0.0) > best["f1"]:
            best = {
                "threshold": round(float(threshold), 2),
                "f1": metrics["f1"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
            }

    return best


def degradation(reference: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """Diferença absoluta e relativa de cada métrica entre dois cenários."""
    result: dict[str, Any] = {}
    for name in METRIC_NAMES:
        base = reference.get(name)
        value = current.get(name)
        if base is None or value is None:
            result[name] = None
            continue
        result[name] = {
            "absolute": round(float(value - base), 6),
            "relative": round(float((value - base) / base), 6) if base else None,
        }
    return result


def metrics_frame(windows: Sequence[dict[str, Any]]) -> pd.DataFrame:
    """Converte janelas avaliadas em DataFrame (para CSV/relatórios)."""
    records = []
    for window in windows:
        metrics = window.get("metrics", {})
        records.append(
            {
                "window": window.get("label"),
                "start_step": window.get("start_step"),
                "end_step": window.get("end_step"),
                "rows": metrics.get("total", window.get("rows")),
                "drift_level": window.get("drift_level", "none"),
                "drift_intensity": window.get("drift_intensity", 0.0),
                "fraud_rate": metrics.get("fraud_rate"),
                "accuracy": metrics.get("accuracy"),
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1": metrics.get("f1"),
                "auc_roc": metrics.get("auc_roc"),
                "pr_auc": metrics.get("pr_auc"),
            }
        )
    return pd.DataFrame(records)


__all__ = [
    "METRIC_NAMES",
    "aggregate_metrics",
    "classification_metrics",
    "degradation",
    "find_best_threshold",
    "metrics_frame",
]
