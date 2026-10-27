"""
Experimento E1 — Desempenho do modelo baseline sem Data Drift.

Objetivo (T1.6): estabelecer a linha de base do estudo. O modelo é treinado na
porção inicial do PaySim (split temporal) e avaliado em janelas temporais
contíguas do **futuro** (conjunto de teste), sem nenhum drift aplicado.

Saídas (``backend/experiments/results/e1`` por padrão):

- ``e1_results.json``  — configuração, métricas do baseline e por janela;
- ``e1_windows.csv``   — métricas por janela temporal;
- ``e1_report.md``     — relatório com a estabilidade ao longo do tempo.

Uso::

    cd backend
    python -m experiments.e1_no_drift --rows 60000 --windows 12
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

# Permite executar como script (python backend/experiments/e1_no_drift.py).
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.loader import dataset_info, load_paysim
from data.preprocess import temporal_split
from data.temporal_simulator import TemporalSimulator
from experiments.common import (
    evaluate_windows,
    format_metric,
    markdown_table,
    metric_row,
    save_results,
    summary_from_windows,
    windows_table,
)
from ml.model import backend_name
from ml.train import train_baseline

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "results" / "e1"


def run_experiment(
    *,
    rows: int = 60_000,
    n_windows: int = 12,
    train_ratio: float = 0.7,
    dataset_path: Optional[str | Path] = None,
    seed: int = 42,
    fraud_rate: float = 0.005,
    save_model: bool = True,
    output_dir: str | Path = DEFAULT_OUTPUT,
) -> dict[str, Any]:
    """Treina o baseline e o avalia em janelas sem drift do período de teste."""
    df = load_paysim(dataset_path, rows=rows, seed=seed, fraud_rate=fraud_rate)
    train_frame, test_frame = temporal_split(df, train_ratio=train_ratio)

    result = train_baseline(
        train_frame,
        rows=len(train_frame),
        seed=seed,
        save=save_model,
        version="v1.1.0",
        eval_frame=test_frame,
    )

    windows = TemporalSimulator(
        test_frame, n_windows=n_windows, seed=seed
    ).windows()
    records = evaluate_windows(result.model, windows)
    baseline_test_metrics = result.test_metrics

    aggregate = summary_from_windows(records)
    window_table = windows_table(records)

    first = records[0]["metrics"] if records else {}
    last = records[-1]["metrics"] if records else {}
    stability = {
        "f1_first_window": first.get("f1"),
        "f1_last_window": last.get("f1"),
        "f1_mean": aggregate.get("f1"),
        "f1_std": aggregate.get("f1_std"),
        "f1_range": (
            round(float(last.get("f1") or 0.0) - float(first.get("f1") or 0.0), 6)
            if records
            else None
        ),
    }

    results: dict[str, Any] = {
        "experiment": "E1",
        "title": "Desempenho do baseline sem Data Drift",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "rows": rows,
            "n_windows": n_windows,
            "train_ratio": train_ratio,
            "seed": seed,
            "fraud_rate": fraud_rate,
            "dataset": str(dataset_path) if dataset_path else "sintético (PaySim)",
            "save_model": save_model,
        },
        "dataset": dataset_info(df),
        "split": result.split.summary(),
        "model": {
            "version": result.version,
            "backend": backend_name(),
            "model_type": result.model.model_type,
            "path": str(result.model_path) if result.model_path else None,
            "feature_importance": result.feature_importance,
        },
        "baseline_test_metrics": baseline_test_metrics,
        "baseline_train_metrics": result.train_metrics,
        "training_holdout_metrics": result.test_metrics,
        "aggregate": aggregate,
        "stability": stability,
        "windows": [
            {
                "index": record["index"],
                "label": record["label"],
                "start_step": record["start_step"],
                "end_step": record["end_step"],
                "rows": record["rows"],
                "metrics": record["metrics"],
            }
            for record in records
        ],
    }

    report = build_markdown_report(results)
    paths = save_results(
        "e1",
        results,
        output_dir,
        tables={"windows": window_table},
        report=report,
    )
    results["artifacts"] = {key: str(value) for key, value in paths.items()}
    return results


def build_markdown_report(results: dict[str, Any]) -> str:
    """Relatório em Markdown do E1."""
    split = results["split"]
    aggregate = results["aggregate"]
    windows = results["windows"]

    lines = [
        "# E1 — Baseline sem Data Drift",
        "",
        f"Gerado em `{results['generated_at']}`.",
        "",
        "## Configuração",
        "",
        f"- Dataset: **{results['config']['dataset']}** "
        f"({results['dataset']['rows']:,} transações, "
        f"{results['dataset']['fraud_rate']:.3%} de fraude)",
        f"- Janelas temporais: **{results['config']['n_windows']}**",
        f"- Split temporal: {split['train_rows']:,} treino / "
        f"{split['test_rows']:,} teste (corte no step {split['split_step']})",
        f"- Modelo: **{results['model']['version']}** "
        f"({results['model']['model_type']})",
        "",
        "## Métricas do baseline (conjunto de teste)",
        "",
        markdown_table(
            [metric_row(results["baseline_test_metrics"])],
            ["precision", "recall", "f1", "auc_roc", "pr_auc", "accuracy"],
            headers=["Precision", "Recall", "F1", "AUC-ROC", "PR-AUC", "Accuracy"],
        ),
        "",
        "## Estabilidade ao longo das janelas (sem drift)",
        "",
        markdown_table(
            [
                {
                    "window": window["label"],
                    "rows": window["rows"],
                    "fraud_rate": window["metrics"]["fraud_rate"],
                    **metric_row(window["metrics"]),
                }
                for window in windows
            ],
            ["window", "rows", "fraud_rate", "precision", "recall", "f1", "auc_roc", "pr_auc"],
            headers=["Janela", "Linhas", "Fraude", "Precision", "Recall", "F1", "AUC-ROC", "PR-AUC"],
        ),
        "",
        "## Resumo",
        "",
        f"- F1 médio: **{format_metric(aggregate.get('f1'))}** "
        f"(σ = {format_metric(aggregate.get('f1_std'))})",
        f"- AUC-ROC médio: **{format_metric(aggregate.get('auc_roc'))}**",
        f"- PR-AUC médio: **{format_metric(aggregate.get('pr_auc'))}**",
        f"- Variação do F1 entre a primeira e a última janela: "
        f"**{format_metric(results['stability']['f1_range'])}**",
        "",
        "Sem drift, espera-se que as métricas permaneçam estáveis entre as "
        "janelas. Qualquer queda sistemática aqui indica instabilidade "
        "temporal do próprio dataset (não efeito do drift).",
        "",
    ]
    return "\n".join(lines)


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="E1 — avalia o modelo baseline em janelas sem drift."
    )
    parser.add_argument("--rows", type=int, default=60_000)
    parser.add_argument("--windows", type=int, default=12)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fraud-rate", type=float, default=0.005)
    parser.add_argument(
        "--no-save-model",
        action="store_true",
        help="Não grava o artefato do modelo baseline.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    print("[E1] Executando baseline sem drift...")
    results = run_experiment(
        rows=args.rows,
        n_windows=args.windows,
        train_ratio=args.train_ratio,
        dataset_path=args.dataset,
        seed=args.seed,
        fraud_rate=args.fraud_rate,
        save_model=not args.no_save_model,
        output_dir=args.output,
    )

    aggregate = results["aggregate"]
    print(
        f"[E1] F1={format_metric(aggregate['f1'])} AUC={format_metric(aggregate['auc_roc'])} "
        f"PR-AUC={format_metric(aggregate['pr_auc'])}"
    )
    print(f"[E1] Saídas: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
