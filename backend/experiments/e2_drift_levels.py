"""
Experimento E2 — Impacto dos cenários de Data Drift no desempenho.

Objetivo (T1.6): medir a degradação do modelo baseline nos três cenários do PDF
(baixo, moderado e forte) e compará-los ao controle sem drift.

Desenho:

1. o baseline é treinado apenas na porção inicial do PaySim (split temporal);
2. o período de teste é dividido em janelas;
3. cada janela recebe o cenário de drift (covariate shift + concept drift);
4. o mesmo modelo é avaliado em cada janela, junto com o PSI/KS das features
   em relação ao treino (detector da Pessoa 2).

Saídas (``backend/experiments/results/e2``):

- ``e2_results.json`` — configuração e resultados completos;
- ``e2_windows.csv``  — métricas e drift por janela/cenário;
- ``e2_summary.csv``  — resumo por cenário;
- ``e2_report.md``    — relatório comparativo.

Uso::

    cd backend
    python -m experiments.e2_drift_levels --rows 60000 --windows 12
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import pandas as pd

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.drift_simulator import DRIFT_LEVELS
from data.loader import dataset_info, load_paysim
from data.preprocess import build_features, temporal_split
from data.temporal_simulator import TemporalSimulator
from experiments.common import (
    drift_signals,
    evaluate_windows,
    format_metric,
    markdown_table,
    metric_row,
    save_results,
    summary_from_windows,
    windows_table,
)
from ml.metrics import degradation
from ml.model import backend_name
from ml.train import train_baseline

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "results" / "e2"
LEVELS = ("none", "low", "moderate", "high")
DRIFT_FEATURES = (
    "amount",
    "old_balance_org",
    "new_balance_org",
    "balance_diff_org",
    "amount_ratio",
    "type",
)


def run_experiment(
    *,
    rows: int = 60_000,
    n_windows: int = 12,
    train_ratio: float = 0.7,
    dataset_path: Optional[str | Path] = None,
    seed: int = 42,
    fraud_rate: float = 0.005,
    save_model: bool = False,
    reference_sample: int = 8_000,
    output_dir: str | Path = DEFAULT_OUTPUT,
) -> dict[str, Any]:
    """Treina o baseline e avalia cada cenário de drift nas janelas de teste."""
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

    reference = build_features(train_frame)
    if len(reference) > reference_sample:
        reference = reference.sample(reference_sample, random_state=seed)
    reference = reference.reset_index(drop=True)

    baseline_test_metrics = result.test_metrics

    scenarios: dict[str, Any] = {}
    window_rows: list[pd.DataFrame] = []
    summary_rows: list[dict[str, Any]] = []
    first_shapshots: dict[str, pd.DataFrame] = {}

    for level in LEVELS:
        windows = TemporalSimulator(
            test_frame, n_windows=n_windows, seed=seed
        ).generate(level=level)
        records = evaluate_windows(result.model, windows)
        aggregate = summary_from_windows(records)

        drift_by_window: list[dict[str, Any]] = []
        for record, window in zip(records, windows):
            current = build_features(window.frame)
            signals = drift_signals(
                reference, current, features=DRIFT_FEATURES
            )
            drift_by_window.append(
                {
                    "window": record["label"],
                    "max_psi": signals["max_psi"],
                    "max_severity": signals["max_severity"],
                    "is_drift": signals["is_drift"],
                    "drifted_features": signals["drifted_features"],
                }
            )
            record["drift"] = drift_by_window[-1]

        if windows:
            first_shapshots[level] = windows[0].frame.head(200)

        drift_summary = {
            "detected_windows": int(
                sum(1 for item in drift_by_window if item["is_drift"])
            ),
            "windows": len(drift_by_window),
            "max_psi": max(
                (
                    item["max_psi"]
                    for item in drift_by_window
                    if item["max_psi"] is not None
                ),
                default=None,
            ),
            "mean_psi": (
                round(
                    sum(
                        item["max_psi"]
                        for item in drift_by_window
                        if item["max_psi"] is not None
                    )
                    / max(
                        1,
                        sum(
                            1
                            for item in drift_by_window
                            if item["max_psi"] is not None
                        ),
                    ),
                    6,
                )
                if drift_by_window
                else None
            ),
        }

        scenarios[level] = {
            "level": level,
            "label": DRIFT_LEVELS[level]["label"],
            "description": DRIFT_LEVELS[level]["description"],
            "intensity": DRIFT_LEVELS[level]["intensity"],
            "aggregate": aggregate,
            "drift": drift_summary,
            "windows": [
                {
                    "index": record["index"],
                    "label": record["label"],
                    "start_step": record["start_step"],
                    "end_step": record["end_step"],
                    "rows": record["rows"],
                    "drift_intensity": record["drift_intensity"],
                    "drift": record["drift"],
                    "metrics": record["metrics"],
                }
                for record in records
            ],
        }

        frame = windows_table(records)
        frame.insert(0, "scenario", level)
        frame["max_psi"] = [item["max_psi"] for item in drift_by_window]
        frame["drift_detected"] = [item["is_drift"] for item in drift_by_window]
        window_rows.append(frame)

        summary_rows.append(
            {
                "scenario": level,
                "intensity": DRIFT_LEVELS[level]["intensity"],
                "windows": aggregate.get("windows"),
                "rows": aggregate.get("rows"),
                "fraud_rate": aggregate.get("fraud_rate"),
                "precision": aggregate.get("precision"),
                "recall": aggregate.get("recall"),
                "f1": aggregate.get("f1"),
                "auc_roc": aggregate.get("auc_roc"),
                "pr_auc": aggregate.get("pr_auc"),
                "f1_std": aggregate.get("f1_std"),
                "max_psi": drift_summary["max_psi"],
                "detected_windows": drift_summary["detected_windows"],
            }
        )

    control = scenarios["none"]["aggregate"]
    for level in LEVELS:
        scenarios[level]["degradation_vs_none"] = degradation(
            control, scenarios[level]["aggregate"]
        )

    windows_frame = (
        pd.concat(window_rows, ignore_index=True) if window_rows else pd.DataFrame()
    )
    summary_frame = pd.DataFrame(summary_rows)

    results: dict[str, Any] = {
        "experiment": "E2",
        "title": "Impacto dos cenários de Data Drift",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "rows": rows,
            "n_windows": n_windows,
            "train_ratio": train_ratio,
            "seed": seed,
            "fraud_rate": fraud_rate,
            "dataset": str(dataset_path) if dataset_path else "sintético (PaySim)",
            "drift_features": list(DRIFT_FEATURES),
        },
        "dataset": dataset_info(df),
        "split": result.split.summary(),
        "model": {
            "version": result.version,
            "backend": backend_name(),
            "model_type": result.model.model_type,
            "path": str(result.model_path) if result.model_path else None,
        },
        "baseline_test_metrics": baseline_test_metrics,
        "scenarios": scenarios,
        "summary": summary_rows,
    }

    report = build_markdown_report(results)
    paths = save_results(
        "e2",
        results,
        output_dir,
        tables={"windows": windows_frame, "summary": summary_frame},
        report=report,
    )
    results["artifacts"] = {key: str(value) for key, value in paths.items()}
    return results


def build_markdown_report(results: dict[str, Any]) -> str:
    """Relatório em Markdown do E2."""
    summary = results["summary"]
    baseline = results["baseline_test_metrics"]
    scenarios = results["scenarios"]

    lines = [
        "# E2 — Impacto dos cenários de Data Drift",
        "",
        f"Gerado em `{results['generated_at']}`.",
        "",
        "## Configuração",
        "",
        f"- Dataset: **{results['config']['dataset']}** "
        f"({results['dataset']['rows']:,} transações)",
        f"- Janelas por cenário: **{results['config']['n_windows']}**",
        f"- Modelo: **{results['model']['version']}** "
        f"({results['model']['model_type']})",
        f"- Baseline (teste sem drift): F1 = **{format_metric(baseline.get('f1'))}**, "
        f"AUC-ROC = **{format_metric(baseline.get('auc_roc'))}**",
        "",
        "## Resumo por cenário",
        "",
        markdown_table(
            summary,
            [
                "scenario",
                "intensity",
                "fraud_rate",
                "precision",
                "recall",
                "f1",
                "auc_roc",
                "pr_auc",
                "max_psi",
                "detected_windows",
            ],
            headers=[
                "Cenário",
                "Intensidade",
                "Taxa fraude",
                "Precision",
                "Recall",
                "F1",
                "AUC-ROC",
                "PR-AUC",
                "PSI máx.",
                "Janelas c/ alerta",
            ],
        ),
        "",
        "## Degradação em relação ao controle (sem drift)",
        "",
        markdown_table(
            [
                {
                    "scenario": level,
                    "f1_abs": scenarios[level]["degradation_vs_none"]["f1"]["absolute"],
                    "f1_rel": scenarios[level]["degradation_vs_none"]["f1"]["relative"],
                    "recall_abs": scenarios[level]["degradation_vs_none"]["recall"]["absolute"],
                    "auc_abs": scenarios[level]["degradation_vs_none"]["auc_roc"]["absolute"],
                    "pr_auc_abs": scenarios[level]["degradation_vs_none"]["pr_auc"]["absolute"],
                }
                for level in LEVELS
            ],
            ["scenario", "f1_abs", "f1_rel", "recall_abs", "auc_abs", "pr_auc_abs"],
            headers=[
                "Cenário",
                "ΔF1",
                "ΔF1 rel.",
                "ΔRecall",
                "ΔAUC-ROC",
                "ΔPR-AUC",
            ],
        ),
        "",
        "## Métricas por janela",
        "",
    ]

    for level in LEVELS:
        scenario = scenarios[level]
        lines.extend(
            [
                f"### {scenario['label']} (`{level}`)",
                "",
                f"_{scenario['description']}_",
                "",
                markdown_table(
                    [
                        {
                            "window": window["label"],
                            "drift_intensity": window["drift_intensity"],
                            "max_psi": window["drift"]["max_psi"],
                            **metric_row(window["metrics"]),
                        }
                        for window in scenario["windows"]
                    ],
                    [
                        "window",
                        "drift_intensity",
                        "max_psi",
                        "precision",
                        "recall",
                        "f1",
                        "auc_roc",
                        "pr_auc",
                    ],
                    headers=[
                        "Janela",
                        "Intensidade",
                        "PSI",
                        "Precision",
                        "Recall",
                        "F1",
                        "AUC-ROC",
                        "PR-AUC",
                    ],
                ),
                "",
            ]
        )

    lines.extend(
        [
            "## Leitura dos resultados",
            "",
            "- O cenário **forte** combina valores ~2x maiores, mudança no mix de "
            "tipos e 10% de uma nova tipologia de fraude que não esvazia a conta.",
            "- A queda de **recall** é o efeito esperado do concept drift: o "
            "modelo continua procurando o padrão antigo.",
            "- A queda de **precision** aparece quando fraudes adaptadas deixam "
            "de ser fraude (falsos positivos) e quando transações legítimas "
            "passam a se parecer com o padrão aprendido.",
            "",
        ]
    )
    return "\n".join(lines)


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="E2 — avalia o baseline nos cenários de drift."
    )
    parser.add_argument("--rows", type=int, default=60_000)
    parser.add_argument("--windows", type=int, default=12)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fraud-rate", type=float, default=0.005)
    parser.add_argument("--reference-sample", type=int, default=8_000)
    parser.add_argument("--save-model", action="store_true")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    print("[E2] Executando cenários de drift...")
    results = run_experiment(
        rows=args.rows,
        n_windows=args.windows,
        train_ratio=args.train_ratio,
        dataset_path=args.dataset,
        seed=args.seed,
        fraud_rate=args.fraud_rate,
        save_model=args.save_model,
        reference_sample=args.reference_sample,
        output_dir=args.output,
    )

    for row in results["summary"]:
        print(
            f"[E2] {row['scenario']:<9} F1={format_metric(row['f1'])} "
            f"AUC={format_metric(row['auc_roc'])} PSI={format_metric(row['max_psi'])}"
        )
    print(f"[E2] Saídas: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
