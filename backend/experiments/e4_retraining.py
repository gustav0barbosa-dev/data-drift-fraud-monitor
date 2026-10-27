"""
Experimento E4 — Eficácia do retreinamento orientado por alertas.

Objetivo (T1.7 / T1.8): comparar duas políticas ao longo de um fluxo com drift
crescente:

- **sem retreino** — o baseline é mantido durante todo o fluxo;
- **retreino por alerta** — quando o detector sinaliza drift, as janelas
  rotuladas mais recentes são usadas para treinar uma nova versão, que passa a
  ser usada a partir da janela seguinte (respeitando um *cooldown*).

A avaliação é sempre *out-of-sample* em relação ao treino: o modelo retreinado
na janela ``i`` só é medido a partir de ``i + 1``.

Saídas (``backend/experiments/results/e4``):

- ``e4_results.json`` — resultados completos;
- ``e4_windows.csv``  — métricas por janela e política;
- ``e4_retrains.csv`` — eventos de retreinamento;
- ``e4_report.md``    — relatório comparativo.

Uso::

    cd backend
    python -m experiments.e4_retraining --rows 60000 --windows 12
"""
from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import pandas as pd

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.drift_simulator import DRIFT_LEVELS, DriftSimulator
from data.loader import dataset_info, load_paysim
from data.preprocess import build_features, temporal_split
from data.temporal_simulator import TemporalSimulator, TemporalWindow
from experiments.common import (
    drift_signals,
    evaluate_windows,
    markdown_table,
    save_results,
    summary_from_windows,
)
from ml.metrics import degradation
from ml.model import backend_name
from ml.retrain import retrain_from_windows
from ml.train import train_baseline

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "results" / "e4"
DRIFT_FEATURES = (
    "amount",
    "old_balance_org",
    "new_balance_org",
    "balance_diff_org",
    "amount_ratio",
    "type",
)


def _drifted_windows(
    test_frame: pd.DataFrame,
    *,
    n_windows: int,
    level: str,
    ramp_windows: int,
    seed: int,
) -> list[TemporalWindow]:
    """Aplica drift com intensidade crescente (ramp) ao longo das janelas."""
    base_intensity = DRIFT_LEVELS[level]["intensity"]
    windows = TemporalSimulator(test_frame, n_windows=n_windows, seed=seed).windows()
    simulator = DriftSimulator(seed=seed)

    drifted: list[TemporalWindow] = []
    for window in windows:
        progress = min(1.0, (window.index + 1) / max(1, ramp_windows))
        intensity = base_intensity * progress
        drifted.append(
            replace(
                window,
                frame=simulator.apply(window.frame, intensity=intensity),
                drift_level=level if intensity > 0 else "none",
                drift_intensity=intensity,
            )
        )
    return drifted


def run_experiment(
    *,
    rows: int = 60_000,
    n_windows: int = 12,
    train_ratio: float = 0.55,
    level: str = "high",
    ramp_windows: int = 4,
    dataset_path: Optional[str | Path] = None,
    seed: int = 42,
    fraud_rate: float = 0.005,
    cooldown: int = 2,
    window_buffer: int = 4,
    alert_psi: float = 0.15,
    reference_sample: int = 8_000,
    output_dir: str | Path = DEFAULT_OUTPUT,
) -> dict[str, Any]:
    """Executa o fluxo com e sem retreinamento orientado por alerta."""
    if level not in DRIFT_LEVELS:
        raise ValueError(f"Nível inválido: {level}")

    df = load_paysim(dataset_path, rows=rows, seed=seed, fraud_rate=fraud_rate)
    train_frame, test_frame = temporal_split(df, train_ratio=train_ratio)

    baseline = train_baseline(
        train_frame,
        rows=len(train_frame),
        seed=seed,
        save=False,
        version="v1.1.0",
        eval_frame=test_frame,
    )

    reference = build_features(train_frame)
    if len(reference) > reference_sample:
        reference = reference.sample(reference_sample, random_state=seed)
    reference = reference.reset_index(drop=True)

    windows = _drifted_windows(
        test_frame,
        n_windows=n_windows,
        level=level,
        ramp_windows=ramp_windows,
        seed=seed,
    )

    # --------------------------------------------------------------
    # Política 1 — sem retreino
    # --------------------------------------------------------------
    static_records = evaluate_windows(baseline.model, windows)
    static_metrics = {record["label"]: record["metrics"] for record in static_records}

    # --------------------------------------------------------------
    # Política 2 — retreino orientado por alerta
    # --------------------------------------------------------------
    current_model = baseline.model
    alert_records: list[dict[str, Any]] = []
    retrain_events: list[dict[str, Any]] = []
    last_retrain_index: Optional[int] = None

    for window in windows:
        current_features = build_features(window.frame)
        signals = drift_signals(reference, current_features, features=DRIFT_FEATURES)

        # O modelo em uso foi treinado até a janela anterior; o retreinamento
        # disparado na janela i só entra em vigor na janela i + 1.
        scores = current_model.predict_proba(current_features)
        from data.preprocess import build_labels
        from ml.metrics import classification_metrics

        metrics = classification_metrics(
            build_labels(window.frame),
            scores,
            threshold=getattr(current_model, "threshold", 0.5),
        )

        alert_records.append(
            {
                "index": window.index,
                "label": window.label,
                "start_step": window.start_step,
                "end_step": window.end_step,
                "rows": len(window.frame),
                "drift_level": window.drift_level,
                "drift_intensity": window.drift_intensity,
                "drift": {
                    "max_psi": signals["max_psi"],
                    "max_severity": signals["max_severity"],
                    "is_drift": signals["is_drift"],
                    "drifted_features": signals["drifted_features"],
                },
                "alert": bool(
                    signals["is_drift"]
                    or (
                        signals["max_psi"] is not None
                        and signals["max_psi"] >= alert_psi
                    )
                ),
                "metrics": metrics,
                "model_version": getattr(current_model, "_experiment_version", "v1.1.0"),
            }
        )

        # ----------------------------------------------------------
        # Gatilho de retreinamento (após avaliar a janela)
        # ----------------------------------------------------------
        should_retrain = (
            alert_records[-1]["alert"]
            and (last_retrain_index is None or window.index - last_retrain_index >= cooldown)
            and window.index >= 1
        )

        if should_retrain:
            start = max(0, window.index - window_buffer + 1)
            training_windows = [item.frame for item in windows[start : window.index + 1]]
            version = f"v1.{2 + len(retrain_events)}.0"
            try:
                retrained = retrain_from_windows(
                    training_windows,
                    version=version,
                    save=False,
                    hyperparameters=baseline.model.hyperparameters,
                )
            except ValueError as exc:
                retrain_events.append(
                    {
                        "window_index": window.index,
                        "window": window.label,
                        "status": "skipped",
                        "reason": str(exc),
                        "max_psi": signals["max_psi"],
                        "training_windows": [
                            item.label for item in windows[start : window.index + 1]
                        ],
                    }
                )
            else:
                current_model = retrained.model
                setattr(current_model, "_experiment_version", retrained.version)
                last_retrain_index = window.index
                retrain_events.append(
                    {
                        "window_index": window.index,
                        "window": window.label,
                        "status": "completed",
                        "version": retrained.version,
                        "max_psi": signals["max_psi"],
                        "rows_used": retrained.rows_used,
                        "fraud_rate": round(retrained.fraud_rate, 6),
                        "training_windows": [
                            item.label for item in windows[start : window.index + 1]
                        ],
                        "metrics": retrained.metrics,
                    }
                )
        elif alert_records[-1]["alert"]:
            logger.debug("Alerta na janela %s aguardando cooldown", window.label)

    alert_metrics = {record["label"]: record["metrics"] for record in alert_records}

    # --------------------------------------------------------------
    # Comparação
    # --------------------------------------------------------------
    comparison: list[dict[str, Any]] = []
    for record in alert_records:
        static = static_metrics[record["label"]]
        alert = alert_metrics[record["label"]]
        comparison.append(
            {
                "index": record["index"],
                "window": record["label"],
                "drift_intensity": record["drift_intensity"],
                "max_psi": record["drift"]["max_psi"],
                "alert": record["alert"],
                "model_version": record["model_version"],
                "f1_no_retrain": static.get("f1"),
                "f1_alert": alert.get("f1"),
                "recall_no_retrain": static.get("recall"),
                "recall_alert": alert.get("recall"),
                "auc_no_retrain": static.get("auc_roc"),
                "auc_alert": alert.get("auc_roc"),
            }
        )

    static_aggregate = summary_from_windows(static_records)
    alert_aggregate = summary_from_windows(alert_records)

    # Métricas nas últimas janelas (regime de drift forte já instalado).
    tail = max(1, min(3, len(alert_records)))
    tail_static = summary_from_windows(static_records[-tail:])
    tail_alert = summary_from_windows(alert_records[-tail:])

    first_f1 = (
        static_records[0]["metrics"].get("f1") if static_records else None
    )
    recovery_threshold = 0.9 * float(first_f1) if first_f1 else None
    time_to_recovery: Optional[int] = None
    if retrain_events and recovery_threshold is not None:
        first_retrain = retrain_events[0]["window_index"]
        for record in alert_records:
            if record["index"] > first_retrain and (record["metrics"].get("f1") or 0) >= recovery_threshold:
                time_to_recovery = record["index"] - first_retrain
                break

    results: dict[str, Any] = {
        "experiment": "E4",
        "title": "Retreinamento orientado por alertas",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "rows": rows,
            "n_windows": n_windows,
            "train_ratio": train_ratio,
            "drift_level": level,
            "ramp_windows": ramp_windows,
            "cooldown": cooldown,
            "window_buffer": window_buffer,
            "alert_psi": alert_psi,
            "seed": seed,
            "fraud_rate": fraud_rate,
            "dataset": str(dataset_path) if dataset_path else "sintético (PaySim)",
        },
        "dataset": dataset_info(df),
        "split": baseline.split.summary(),
        "baseline": {
            "version": baseline.version,
            "backend": backend_name(),
            "model_type": baseline.model.model_type,
            "test_metrics": baseline.test_metrics,
        },
        "policies": {
            "no_retrain": {
                "aggregate": static_aggregate,
                "tail": tail_static,
                "windows": [
                    {
                        "index": record["index"],
                        "label": record["label"],
                        "drift_intensity": record["drift_intensity"],
                        "metrics": record["metrics"],
                    }
                    for record in static_records
                ],
            },
            "alert_retrain": {
                "aggregate": alert_aggregate,
                "tail": tail_alert,
                "windows": alert_records,
                "retrains": retrain_events,
            },
        },
        "comparison": comparison,
        "summary": {
            "retrains": len([event for event in retrain_events if event["status"] == "completed"]),
            "skipped_retrains": len([event for event in retrain_events if event["status"] == "skipped"]),
            "drift_alerts": int(sum(1 for record in alert_records if record["alert"])),
            "first_alert_window": next(
                (record["label"] for record in alert_records if record["alert"]), None
            ),
            "first_retrain_window": (
                retrain_events[0]["window"] if retrain_events else None
            ),
            "time_to_recovery_windows": time_to_recovery,
            "recovery_threshold_f1": round(recovery_threshold, 6) if recovery_threshold else None,
            "f1_gain_tail": (
                round(
                    float(tail_alert.get("f1") or 0.0)
                    - float(tail_static.get("f1") or 0.0),
                    6,
                )
                if tail_alert.get("f1") is not None and tail_static.get("f1") is not None
                else None
            ),
            "degradation_without_retrain": degradation(
                static_records[0]["metrics"], static_aggregate
            )
            if static_records
            else {},
        },
    }

    comparison_frame = pd.DataFrame(comparison)
    retrains_frame = pd.DataFrame(retrain_events)
    report = build_markdown_report(results)
    paths = save_results(
        "e4",
        results,
        output_dir,
        tables={
            "windows": comparison_frame,
            "retrains": retrains_frame,
        },
        report=report,
    )
    results["artifacts"] = {key: str(value) for key, value in paths.items()}
    return results


def build_markdown_report(results: dict[str, Any]) -> str:
    """Relatório em Markdown do E4."""
    config = results["config"]
    summary = results["summary"]
    policies = results["policies"]
    comparison = results["comparison"]

    lines = [
        "# E4 — Retreinamento orientado por alertas",
        "",
        f"Gerado em `{results['generated_at']}`.",
        "",
        "## Configuração",
        "",
        f"- Dataset: **{config['dataset']}** ({results['dataset']['rows']:,} transações)",
        f"- Janelas: **{config['n_windows']}** | ramp de drift: "
        f"**{config['ramp_windows']}** janelas | nível final: **{config['drift_level']}**",
        f"- Cooldown entre retreinos: **{config['cooldown']}** janelas | "
        f"buffer de treino: **{config['window_buffer']}** janelas",
        f"- Gatilho: drift crítico do detector ou PSI ≥ {config['alert_psi']}",
        f"- Baseline: **{results['baseline']['version']}** "
        f"({results['baseline']['model_type']})",
        "",
        "## Comparação agregada",
        "",
        markdown_table(
            [
                {
                    "policy": "sem retreino",
                    "f1": policies["no_retrain"]["aggregate"].get("f1"),
                    "recall": policies["no_retrain"]["aggregate"].get("recall"),
                    "precision": policies["no_retrain"]["aggregate"].get("precision"),
                    "auc_roc": policies["no_retrain"]["aggregate"].get("auc_roc"),
                    "pr_auc": policies["no_retrain"]["aggregate"].get("pr_auc"),
                    "tail_f1": policies["no_retrain"]["tail"].get("f1"),
                },
                {
                    "policy": "retreino por alerta",
                    "f1": policies["alert_retrain"]["aggregate"].get("f1"),
                    "recall": policies["alert_retrain"]["aggregate"].get("recall"),
                    "precision": policies["alert_retrain"]["aggregate"].get("precision"),
                    "auc_roc": policies["alert_retrain"]["aggregate"].get("auc_roc"),
                    "pr_auc": policies["alert_retrain"]["aggregate"].get("pr_auc"),
                    "tail_f1": policies["alert_retrain"]["tail"].get("f1"),
                },
            ],
            ["policy", "f1", "recall", "precision", "auc_roc", "pr_auc", "tail_f1"],
            headers=[
                "Política",
                "F1 médio",
                "Recall",
                "Precision",
                "AUC-ROC",
                "PR-AUC",
                "F1 (últimas janelas)",
            ],
        ),
        "",
        "## Eventos de retreinamento",
        "",
        markdown_table(
            policies["alert_retrain"]["retrains"],
            ["window", "status", "version", "max_psi", "rows_used", "training_windows"],
            headers=["Janela", "Status", "Versão", "PSI", "Linhas", "Janelas de treino"],
        )
        if policies["alert_retrain"]["retrains"]
        else "_Nenhum retreinamento foi disparado._",
        "",
        "## Métricas por janela",
        "",
        markdown_table(
            [
                {
                    "window": row["window"],
                    "drift_intensity": row["drift_intensity"],
                    "max_psi": row["max_psi"],
                    "alert": "sim" if row["alert"] else "não",
                    "f1_no_retrain": row["f1_no_retrain"],
                    "f1_alert": row["f1_alert"],
                    "recall_no_retrain": row["recall_no_retrain"],
                    "recall_alert": row["recall_alert"],
                }
                for row in comparison
            ],
            [
                "window",
                "drift_intensity",
                "max_psi",
                "alert",
                "f1_no_retrain",
                "f1_alert",
                "recall_no_retrain",
                "recall_alert",
            ],
            headers=[
                "Janela",
                "Intensidade",
                "PSI",
                "Alerta",
                "F1 s/ retreino",
                "F1 c/ retreino",
                "Recall s/ retreino",
                "Recall c/ retreino",
            ],
        ),
        "",
        "## Resumo",
        "",
        f"- Alertas de drift: **{summary['drift_alerts']}** "
        f"(primeiro em {summary['first_alert_window'] or '—'})",
        f"- Retreinos concluídos: **{summary['retrains']}** "
        f"(primeiro em {summary['first_retrain_window'] or '—'})",
        f"- Janelas até recuperar 90% do F1 inicial: "
        f"**{summary['time_to_recovery_windows'] if summary['time_to_recovery_windows'] is not None else 'não recuperado'}**",
        f"- Ganho de F1 nas últimas janelas: **{_fmt(summary['f1_gain_tail'])}**",
        "",
        "O retreinamento por alerta usa apenas dados rotulados já disponíveis e "
        "só entra em produção na janela seguinte, reproduzindo a latência real "
        "entre detecção, treino e implantação.",
        "",
    ]
    return "\n".join(lines)


def _fmt(value: Any) -> str:
    return "—" if value is None else f"{float(value):.4f}"


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="E4 — compara retreino por alerta com modelo estático."
    )
    parser.add_argument("--rows", type=int, default=60_000)
    parser.add_argument("--windows", type=int, default=12)
    parser.add_argument("--train-ratio", type=float, default=0.55)
    parser.add_argument("--level", choices=sorted(DRIFT_LEVELS), default="high")
    parser.add_argument("--ramp-windows", type=int, default=4)
    parser.add_argument("--cooldown", type=int, default=2)
    parser.add_argument("--window-buffer", type=int, default=4)
    parser.add_argument("--alert-psi", type=float, default=0.15)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fraud-rate", type=float, default=0.005)
    parser.add_argument("--reference-sample", type=int, default=8_000)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    print("[E4] Executando retreinamento orientado por alertas...")
    results = run_experiment(
        rows=args.rows,
        n_windows=args.windows,
        train_ratio=args.train_ratio,
        level=args.level,
        ramp_windows=args.ramp_windows,
        dataset_path=args.dataset,
        seed=args.seed,
        fraud_rate=args.fraud_rate,
        cooldown=args.cooldown,
        window_buffer=args.window_buffer,
        alert_psi=args.alert_psi,
        reference_sample=args.reference_sample,
        output_dir=args.output,
    )

    summary = results["summary"]
    print(
        f"[E4] retreinos={summary['retrains']} "
        f"F1(sem)={_fmt(results['policies']['no_retrain']['aggregate'].get('f1'))} "
        f"F1(com)={_fmt(results['policies']['alert_retrain']['aggregate'].get('f1'))} "
        f"ganho_tail={_fmt(summary['f1_gain_tail'])}"
    )
    print(f"[E4] Saídas: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
