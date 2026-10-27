"""
Utilidades compartilhadas dos experimentos da Pessoa 1 (E1, E2 e E4).

Os experimentos seguem o mesmo contrato de saída do E3 (Pessoa 2):
JSON completo, CSVs tabulares e relatório Markdown legível.
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from data.preprocess import build_features, build_labels
from ml.metrics import aggregate_metrics, classification_metrics, metrics_frame
from ml.model import FraudModel


# ----------------------------------------------------------------------
# Serialização
# ----------------------------------------------------------------------
def jsonable(value: Any) -> Any:
    """Converte tipos NumPy/Pandas/Path em estruturas serializáveis em JSON."""
    if isinstance(value, Mapping):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        number = float(value)
        return None if math.isnan(number) or math.isinf(number) else number
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if value is pd.NA:
        return None
    return value


def save_results(
    name: str,
    results: Mapping[str, Any],
    output_dir: str | Path,
    *,
    tables: Optional[Mapping[str, pd.DataFrame]] = None,
    report: Optional[str] = None,
) -> dict[str, Path]:
    """Salva ``{name}_results.json``, CSVs e ``{name}_report.md``."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    paths: dict[str, Path] = {}
    json_path = output_dir / f"{name}_results.json"
    json_path.write_text(
        json.dumps(jsonable(results), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    paths["json"] = json_path

    for table_name, frame in (tables or {}).items():
        csv_path = output_dir / f"{name}_{table_name}.csv"
        frame.to_csv(csv_path, index=False)
        paths[table_name] = csv_path

    if report is not None:
        report_path = output_dir / f"{name}_report.md"
        report_path.write_text(report, encoding="utf-8")
        paths["report"] = report_path

    return paths


# ----------------------------------------------------------------------
# Avaliação de janelas
# ----------------------------------------------------------------------
def evaluate_windows(
    model: FraudModel,
    windows: Sequence[Any],
    *,
    threshold: Optional[float] = None,
) -> list[dict[str, Any]]:
    """
    Avalia o modelo em cada janela temporal.

    ``windows`` pode conter ``TemporalWindow`` ou DataFrames simples. Quando
    ``threshold`` é ``None``, usa o limiar calibrado do próprio modelo.
    """
    cutoff = getattr(model, "threshold", 0.5) if threshold is None else float(threshold)
    records: list[dict[str, Any]] = []

    for position, window in enumerate(windows):
        frame = getattr(window, "frame", window)
        label = getattr(window, "label", f"W{position + 1:02d}")
        if frame is None or len(frame) == 0:
            continue

        features = build_features(frame)
        labels = build_labels(frame)
        scores = model.predict_proba(features)
        metrics = classification_metrics(labels, scores, threshold=cutoff)

        records.append(
            {
                "index": int(getattr(window, "index", position)),
                "label": label,
                "start_step": int(getattr(window, "start_step", frame["step"].min())),
                "end_step": int(getattr(window, "end_step", frame["step"].max())),
                "rows": int(len(frame)),
                "drift_level": getattr(window, "drift_level", "none"),
                "drift_intensity": float(getattr(window, "drift_intensity", 0.0)),
                "metrics": metrics,
            }
        )

    return records


def summary_from_windows(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Média das métricas por janela + desvio-padrão do F1."""
    aggregate = aggregate_metrics(records)
    aggregate["rows"] = int(sum(record["rows"] for record in records))
    aggregate["fraud_rate"] = (
        round(
            float(
                np.average(
                    [record["metrics"]["fraud_rate"] for record in records],
                    weights=[record["metrics"]["total"] for record in records],
                )
            ),
            6,
        )
        if records
        else None
    )
    return aggregate


def windows_table(records: Sequence[dict[str, Any]]) -> pd.DataFrame:
    """DataFrame com uma linha por janela avaliada."""
    frame = metrics_frame(records)
    frame["index"] = [record["index"] for record in records]
    return frame.sort_values("index").reset_index(drop=True)


# ----------------------------------------------------------------------
# Drift (reutiliza o detector da Pessoa 2)
# ----------------------------------------------------------------------
def drift_signals(
    reference: pd.DataFrame,
    current: pd.DataFrame,
    *,
    features: Sequence[str],
    methods: Sequence[str] = ("psi", "ks"),
) -> dict[str, Any]:
    """Calcula drift por feature entre duas janelas (usa ``drift.detector``)."""
    from drift.detector import DriftDetector

    detector = DriftDetector(methods=methods)
    per_feature: dict[str, Any] = {}

    for feature in features:
        if feature not in reference.columns or feature not in current.columns:
            continue
        try:
            result = detector.detect(
                reference[feature].to_numpy(),
                current[feature].to_numpy(),
                feature_name=feature,
                categorical=feature == "type",
            )
        except ValueError:
            continue
        per_feature[feature] = {
            "psi": result.get("psi"),
            "ks_stat": result.get("ks_stat"),
            "ks_pvalue": result.get("ks_pvalue"),
            "severity": result.get("severity"),
            "is_drift": result.get("is_drift"),
            "drift_score": result.get("drift_score"),
        }

    if not per_feature:
        return {
            "features": {},
            "max_psi": None,
            "max_severity": "none",
            "is_drift": False,
            "drifted_features": [],
        }

    severities = [signal["severity"] for signal in per_feature.values()]
    order = {"none": 0, "warning": 1, "critical": 2}
    max_severity = max(severities, key=lambda item: order.get(item, 0))
    max_psi = max(
        (
            signal["psi"]
            for signal in per_feature.values()
            if signal.get("psi") is not None
        ),
        default=None,
    )

    return {
        "features": per_feature,
        "max_psi": max_psi,
        "max_severity": max_severity,
        "is_drift": any(signal["is_drift"] for signal in per_feature.values()),
        "drifted_features": [
            name
            for name, signal in per_feature.items()
            if signal.get("is_drift")
        ],
    }


# ----------------------------------------------------------------------
# Relatório
# ----------------------------------------------------------------------
def markdown_table(
    rows: Iterable[Mapping[str, Any]],
    columns: Sequence[str],
    *,
    headers: Optional[Sequence[str]] = None,
    formats: Optional[Mapping[str, str]] = None,
) -> str:
    """Monta uma tabela Markdown simples."""
    headers = headers or columns
    formats = formats or {}

    def _format(column: str, value: Any) -> str:
        if value is None:
            return "—"
        if column in formats:
            try:
                return formats[column].format(value)
            except (ValueError, TypeError):
                return str(value)
        if isinstance(value, float):
            return f"{value:.4f}"
        return str(value)

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append(
            "| "
            + " | ".join(_format(column, row.get(column)) for column in columns)
            + " |"
        )
    return "\n".join(lines)


def format_metric(value: Any) -> str:
    """Formata um valor numérico para as tabelas dos relatórios."""
    return "-" if value is None else f"{float(value):.4f}"


def metric_row(metrics: Mapping[str, Any]) -> dict[str, Any]:
    """Seleciona as métricas exibidas nos relatórios."""
    return {
        "accuracy": metrics.get("accuracy"),
        "precision": metrics.get("precision"),
        "recall": metrics.get("recall"),
        "f1": metrics.get("f1"),
        "auc_roc": metrics.get("auc_roc"),
        "pr_auc": metrics.get("pr_auc"),
    }


__all__ = [
    "drift_signals",
    "evaluate_windows",
    "format_metric",
    "jsonable",
    "markdown_table",
    "metric_row",
    "save_results",
    "summary_from_windows",
    "windows_table",
]
