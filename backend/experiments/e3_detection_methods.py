"""
Experimento E3 — Comparação da sensibilidade dos métodos de detecção.

Objetivo (T2.6): comparar PSI, KS, Jensen-Shannon e Wasserstein quanto a:

- sensibilidade (taxa de detecção quando há drift);
- especificidade (taxa de não detecção quando não há drift);
- AUC-ROC (poder de discriminação, independente do limiar);
- latência de detecção (janelas até o primeiro alerta);
- concordância entre métodos (kappa de Cohen e McNemar).

Como os módulos de dados da Pessoa 1 ainda podem não estar disponíveis, o
experimento gera distribuições sintéticas controladas. A função
:func:`evaluate_windows` também pode ser usada com dados reais (PaySim) para
reproduzir a análise.

Uso::

    cd backend
    python -m experiments.e3_detection_methods --repetitions 200

Saídas (em ``backend/experiments/results/e3`` por padrão):

- ``e3_results.json``   — resultados completos;
- ``e3_report.md``      — relatório comparativo;
- ``e3_performance.csv``— tabela de sensibilidade/especificidade;
- ``e3_latency.csv``    — tabela de latência.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

import numpy as np

# Permite executar como script (python backend/experiments/e3_...py).
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from drift.detector import DriftDetector
from drift.thresholds import DEFAULT_THRESHOLDS, METHOD_NAMES, DriftThresholds
from experiments.statistical_analysis import (
    bootstrap_auc_ci,
    classification_metrics,
    paired_comparison,
    roc_auc,
    wilson_ci,
)


@dataclass(frozen=True)
class DriftScenario:
    """Cenário controlado de drift (em desvios-padrão da referência)."""

    name: str
    shift: float
    scale: float
    label: int  # 1 = drift, 0 = sem drift
    description: str


# Cenários alinhados ao PDF (baixo, moderado, forte) + controle sem drift.
SCENARIOS: tuple[DriftScenario, ...] = (
    DriftScenario("none", 0.00, 1.00, 0, "Sem drift (controle)"),
    DriftScenario("low", 0.20, 1.05, 1, "Drift baixo: deslocamento de 0,2σ"),
    DriftScenario("moderate", 0.50, 1.20, 1, "Drift moderado: 0,5σ + 20% de escala"),
    DriftScenario("high", 1.00, 1.50, 1, "Drift forte: 1,0σ + 50% de escala"),
)

METHOD_LABELS = {
    "psi": "PSI",
    "ks": "KS",
    "js": "Jensen-Shannon",
    "wasserstein": "Wasserstein",
}


# ----------------------------------------------------------------------
# Núcleo do experimento
# ----------------------------------------------------------------------
def run_experiment(
    *,
    repetitions: int = 200,
    latency_repetitions: int = 50,
    n_reference: int = 1000,
    n_current: int = 500,
    window_size: int = 300,
    max_windows: int = 12,
    ramp_windows: int = 5,
    seed: int = 42,
    methods: Sequence[str] = METHOD_NAMES,
    thresholds: Optional[DriftThresholds] = None,
) -> dict[str, Any]:
    """
    Executa o E3 completo e retorna um dicionário serializável.

    Args:
        repetitions: Repetições Monte Carlo por cenário (detecção pontual).
        latency_repetitions: Repetições da simulação sequencial.
        n_reference: Tamanho da amostra de referência.
        n_current: Tamanho da amostra atual em cada repetição.
        window_size: Tamanho de cada janela na simulação de latência.
        max_windows: Número máximo de janelas observadas.
        ramp_windows: Janelas até o drift atingir a intensidade máxima.
        seed: Semente para reprodutibilidade.
        methods: Métodos a comparar.
        thresholds: Limiares (default: padrão do sistema).
    """
    if repetitions < 2:
        raise ValueError("repetitions deve ser >= 2")
    if latency_repetitions < 1:
        raise ValueError("latency_repetitions deve ser >= 1")

    thresholds = thresholds or DEFAULT_THRESHOLDS
    if n_reference < thresholds.min_samples or n_current < thresholds.min_samples:
        raise ValueError(
            f"n_reference e n_current devem ser >= {thresholds.min_samples}"
        )

    detector = DriftDetector(thresholds, methods=methods)
    rng = np.random.default_rng(seed)

    pooled_scores: dict[str, list[float]] = {m: [] for m in methods}
    pooled_decisions: dict[str, list[bool]] = {m: [] for m in methods}
    pooled_labels: list[int] = []

    performance: dict[str, dict[str, Any]] = {}

    for scenario in SCENARIOS:
        detections = {m: [] for m in methods}
        scores_by_method = {m: [] for m in methods}

        for _ in range(repetitions):
            reference = _sample(rng, n_reference, shift=0.0, scale=1.0)
            current = _sample(
                rng, n_current, shift=scenario.shift, scale=scenario.scale
            )

            result = detector.detect(reference, current, feature_name=scenario.name)
            for method in methods:
                method_result = result["methods"].get(method, {})
                detected = bool(method_result.get("is_drift", False))
                detections[method].append(detected)

                score = _method_score(method, method_result, result)
                scores_by_method[method].append(score)

                pooled_decisions[method].append(detected)
                pooled_scores[method].append(score)

            pooled_labels.append(scenario.label)

        scenario_performance: dict[str, Any] = {
            "shift": scenario.shift,
            "scale": scenario.scale,
            "label": scenario.label,
            "description": scenario.description,
            "n_runs": repetitions,
            "methods": {},
        }

        for method in methods:
            values = np.asarray(detections[method], dtype=bool)
            successes = int(values.sum())
            lower, upper = wilson_ci(successes, len(values))
            scenario_performance["methods"][method] = {
                "detection_rate": float(values.mean()),
                "successes": successes,
                "n": int(values.size),
                "ci_lower": lower,
                "ci_upper": upper,
                "mean_score": float(np.mean(scores_by_method[method])),
            }

        performance[scenario.name] = scenario_performance

    labels = np.asarray(pooled_labels, dtype=bool)

    pooled: dict[str, Any] = {}
    for method in methods:
        decisions = np.asarray(pooled_decisions[method], dtype=bool)
        scores = np.asarray(pooled_scores[method], dtype=float)
        pooled[method] = {
            "auc": roc_auc(labels, scores),
            "auc_ci": bootstrap_auc_ci(labels, scores, n_boot=1000, seed=seed),
            "classification": classification_metrics(decisions, labels),
            "mean_detection_rate": float(decisions.mean()),
        }

    latency = _run_latency_experiment(
        detector=detector,
        methods=methods,
        rng=rng,
        repetitions=latency_repetitions,
        n_reference=n_reference,
        window_size=window_size,
        max_windows=max_windows,
        ramp_windows=ramp_windows,
    )

    pairwise = paired_comparison(
        {m: pooled_decisions[m] for m in methods},
        labels,
        n_boot=500,
        seed=seed,
    )
    n_pairs = len(pairwise)
    bonferroni_alpha = 0.05 / n_pairs if n_pairs else 0.05

    ranking = {
        "by_auc": sorted(
            methods,
            key=lambda m: (pooled[m]["auc"] if pooled[m]["auc"] is not None else -1),
            reverse=True,
        ),
        "by_sensitivity": sorted(
            methods,
            key=lambda m: pooled[m]["classification"]["sensitivity"],
            reverse=True,
        ),
        "by_false_positive_rate": sorted(
            methods,
            key=lambda m: pooled[m]["classification"]["false_positive_rate"],
        ),
        "by_latency": sorted(
            methods,
            key=lambda m: _mean_latency(latency, m, max_windows),
        ),
    }

    return {
        "experiment": "E3 — Comparação da sensibilidade dos métodos de detecção",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "repetitions": repetitions,
            "latency_repetitions": latency_repetitions,
            "n_reference": n_reference,
            "n_current": n_current,
            "window_size": window_size,
            "max_windows": max_windows,
            "ramp_windows": ramp_windows,
            "seed": seed,
            "methods": list(methods),
            "thresholds": thresholds.to_dict(),
            "bonferroni_alpha": bonferroni_alpha,
        },
        "scenarios": {
            s.name: {
                "shift": s.shift,
                "scale": s.scale,
                "label": s.label,
                "description": s.description,
            }
            for s in SCENARIOS
        },
        "performance": performance,
        "pooled": pooled,
        "latency": latency,
        "pairwise": pairwise,
        "ranking": ranking,
    }


def evaluate_windows(
    reference: Any,
    windows: Iterable[Any],
    *,
    methods: Sequence[str] = METHOD_NAMES,
    thresholds: Optional[DriftThresholds] = None,
) -> dict[str, Any]:
    """
    Avalia uma sequência de janelas reais (ex.: PaySim) contra uma referência.

    Retorna uma linha por janela, com métricas e decisões por método. Útil
    para calcular latência de detecção em dados reais.
    """
    thresholds = thresholds or DEFAULT_THRESHOLDS
    detector = DriftDetector(thresholds, methods=methods)
    rows: list[dict[str, Any]] = []

    for index, window in enumerate(windows, start=1):
        result = detector.detect(reference, window)
        rows.append(
            {
                "window": index,
                "n_current": result["n_current"],
                "severity": result["severity"],
                "is_drift": result["is_drift"],
                "psi": result["psi"],
                "ks_stat": result["ks_stat"],
                "ks_pvalue": result["ks_pvalue"],
                "js": result["js"],
                "wasserstein": result["wasserstein"],
                "wasserstein_normalized": result["wasserstein_normalized"],
                "decisions": {
                    method: result["methods"].get(method, {}).get("is_drift", False)
                    for method in methods
                },
            }
        )

    return {"reference_size": int(np.asarray(reference).size), "windows": rows}


# ----------------------------------------------------------------------
# Latência
# ----------------------------------------------------------------------
def _run_latency_experiment(
    *,
    detector: DriftDetector,
    methods: Sequence[str],
    rng: np.random.Generator,
    repetitions: int,
    n_reference: int,
    window_size: int,
    max_windows: int,
    ramp_windows: int,
) -> dict[str, Any]:
    """Simula a chegada gradual do drift e mede janelas até o alerta."""
    output: dict[str, Any] = {}

    for scenario in SCENARIOS:
        if scenario.label == 0:
            continue

        first_detection = {method: [] for method in (*methods, "any")}

        for _ in range(repetitions):
            reference = _sample(rng, n_reference, shift=0.0, scale=1.0)
            first = {method: None for method in (*methods, "any")}

            for window in range(1, max_windows + 1):
                fraction = min(1.0, window / max(1, ramp_windows))
                current = _sample(
                    rng,
                    window_size,
                    shift=scenario.shift * fraction,
                    scale=1.0 + (scenario.scale - 1.0) * fraction,
                )
                result = detector.detect(reference, current)

                for method in methods:
                    detected = bool(
                        result["methods"].get(method, {}).get("is_drift", False)
                    )
                    if detected and first[method] is None:
                        first[method] = window
                    if detected and first["any"] is None:
                        first["any"] = window

            for key in first:
                first_detection[key].append(
                    first[key] if first[key] is not None else max_windows + 1
                )

        scenario_latency: dict[str, Any] = {
            "shift": scenario.shift,
            "scale": scenario.scale,
            "n_runs": repetitions,
            "max_windows": max_windows,
            "methods": {},
        }

        for method, values in first_detection.items():
            array = np.asarray(values, dtype=int)
            detected = array <= max_windows
            curve = [
                float(np.mean(array <= k)) for k in range(1, max_windows + 1)
            ]
            median = _median_survival(array, max_windows)
            scenario_latency["methods"][method] = {
                "detection_rate": float(detected.mean()),
                "median_detection_window": median,
                "mean_windows_to_detection": float(array.mean()),
                "censored": int((~detected).sum()),
                "detection_curve": curve,
            }

        output[scenario.name] = scenario_latency

    return output


def _median_survival(values: np.ndarray, max_windows: int) -> Optional[float]:
    """Mediana com censura à direita (valores > max_windows são censurados)."""
    for window in range(1, max_windows + 1):
        # Sobrevivência = proporção ainda não detectada após esta janela.
        survival = float(np.mean(values > window))
        if survival <= 0.5:
            return float(window)
    return None


def _mean_latency(latency: Mapping[str, Any], method: str, max_windows: int) -> float:
    values = [
        scenario["methods"].get(method, {}).get(
            "mean_windows_to_detection", max_windows + 1
        )
        for scenario in latency.values()
    ]
    return float(np.mean(values)) if values else float(max_windows + 1)


# ----------------------------------------------------------------------
# Helpers de dados e scores
# ----------------------------------------------------------------------
def _sample(
    rng: np.random.Generator,
    size: int,
    *,
    shift: float,
    scale: float,
) -> np.ndarray:
    """Amostra normal controlada (referência padronizada em média 0, dp 1)."""
    return rng.normal(loc=shift, scale=scale, size=size)


def _method_score(
    method: str,
    method_result: Mapping[str, Any],
    detector_result: Mapping[str, Any],
) -> float:
    """Score orientado para "quanto maior, mais drift" (para AUC)."""
    if not method_result.get("available", False):
        return float("nan")

    if method == "ks":
        # p-valor menor = mais drift; invertemos para manter a orientação.
        return float(1.0 - float(method_result.get("value", 1.0)))

    if method == "wasserstein":
        return float(detector_result.get("wasserstein_normalized") or 0.0)

    return float(method_result.get("value", 0.0))


# ----------------------------------------------------------------------
# Persistência e relatório
# ----------------------------------------------------------------------
def save_results(results: Mapping[str, Any], output_dir: Path) -> dict[str, Path]:
    """Salva JSON, CSVs e relatório Markdown."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "e3_results.json"
    json_path.write_text(
        json.dumps(_jsonable(results), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    performance_path = output_dir / "e3_performance.csv"
    _write_performance_csv(results, performance_path)

    latency_path = output_dir / "e3_latency.csv"
    _write_latency_csv(results, latency_path)

    report_path = output_dir / "e3_report.md"
    report_path.write_text(build_markdown_report(results), encoding="utf-8")

    return {
        "json": json_path,
        "performance_csv": performance_path,
        "latency_csv": latency_path,
        "report": report_path,
    }


def _write_performance_csv(results: Mapping[str, Any], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "scenario",
                "method",
                "detection_rate",
                "ci_lower",
                "ci_upper",
                "successes",
                "n",
                "mean_score",
            ]
        )
        for scenario_name, scenario in results["performance"].items():
            for method, data in scenario["methods"].items():
                writer.writerow(
                    [
                        scenario_name,
                        method,
                        round(data["detection_rate"], 6),
                        round(data["ci_lower"], 6),
                        round(data["ci_upper"], 6),
                        data["successes"],
                        data["n"],
                        round(data["mean_score"], 6),
                    ]
                )


def _write_latency_csv(results: Mapping[str, Any], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "scenario",
                "method",
                "detection_rate",
                "median_detection_window",
                "mean_windows_to_detection",
                "censored",
                "n_runs",
            ]
        )
        for scenario_name, scenario in results["latency"].items():
            for method, data in scenario["methods"].items():
                writer.writerow(
                    [
                        scenario_name,
                        method,
                        round(data["detection_rate"], 6),
                        data["median_detection_window"],
                        round(data["mean_windows_to_detection"], 4),
                        data["censored"],
                        scenario["n_runs"],
                    ]
                )


def build_markdown_report(results: Mapping[str, Any]) -> str:
    """Gera o relatório comparativo em Markdown."""
    config = results["config"]
    lines: list[str] = []

    lines.append("# Relatório E3 — Comparação dos métodos de detecção de drift")
    lines.append("")
    lines.append(
        "> Gerado automaticamente por "
        "`backend/experiments/e3_detection_methods.py` em "
        f"{results['generated_at']}."
    )
    lines.append("")
    lines.append("## 1. Metodologia")
    lines.append("")
    lines.append(
        "Foram geradas amostras sintéticas de uma feature contínua "
        f"(referência: n={config['n_reference']}; atual: n={config['n_current']}) "
        f"em {config['repetitions']} repetições Monte Carlo por cenário. "
        "O drift foi induzido por deslocamento de média e mudança de escala, "
        "em unidades de desvio-padrão da referência."
    )
    lines.append("")
    lines.append(
        "Cada método decide drift aplicando seus limiares críticos "
        f"(trigger = `{config['thresholds']['trigger_severity']}`):"
    )
    lines.append("")
    lines.append("| Método | Warning | Critical | Direção |")
    lines.append("|---|---:|---:|---|")
    for method in config["methods"]:
        threshold = config["thresholds"][method]
        lines.append(
            f"| {METHOD_LABELS[method]} | {threshold['warning']} | "
            f"{threshold['critical']} | {threshold['direction']} |"
        )
    lines.append("")
    lines.append("### Cenários")
    lines.append("")
    lines.append("| Cenário | Deslocamento (σ) | Escala | Rótulo | Descrição |")
    lines.append("|---|---:|---:|---|---|")
    for name, scenario in results["scenarios"].items():
        lines.append(
            f"| {name} | {scenario['shift']:.2f} | {scenario['scale']:.2f} | "
            f"{'drift' if scenario['label'] else 'sem drift'} | "
            f"{scenario['description']} |"
        )
    lines.append("")

    lines.append("## 2. Sensibilidade e especificidade")
    lines.append("")
    lines.append(
        "A taxa de detecção é a sensibilidade nos cenários com drift e a "
        "taxa de falso positivo (1 − especificidade) no cenário `none`. "
        "Intervalos de confiança de Wilson (95%)."
    )
    lines.append("")
    lines.append("| Cenário | Método | Taxa de detecção | IC 95% |")
    lines.append("|---|---|---:|---|")
    for scenario_name, scenario in results["performance"].items():
        for method, data in scenario["methods"].items():
            lines.append(
                f"| {scenario_name} | {METHOD_LABELS[method]} | "
                f"{data['detection_rate']:.3f} | "
                f"[{data['ci_lower']:.3f}, {data['ci_upper']:.3f}] |"
            )
    lines.append("")

    lines.append("## 3. Poder de discriminação (AUC-ROC)")
    lines.append("")
    lines.append(
        "A AUC foi calculada com os scores contínuos de cada método, "
        "agregando os quatro cenários (drift vs. sem drift). "
        "Para o KS usamos `1 − p-valor` como score."
    )
    lines.append("")
    lines.append("| Método | AUC | IC 95% (bootstrap) | Sensibilidade | Especificidade | F1 | MCC |")
    lines.append("|---|---:|---|---:|---:|---:|---:|")
    for method in config["methods"]:
        data = results["pooled"][method]
        auc = data["auc"]
        auc_ci = data["auc_ci"]
        classification = data["classification"]
        auc_text = f"{auc:.3f}" if auc is not None else "n/d"
        ci_text = (
            f"[{auc_ci['lower']:.3f}, {auc_ci['upper']:.3f}]"
            if auc_ci.get("lower") is not None
            else "n/d"
        )
        lines.append(
            f"| {METHOD_LABELS[method]} | {auc_text} | {ci_text} | "
            f"{classification['sensitivity']:.3f} | "
            f"{classification['specificity']:.3f} | "
            f"{classification['f1']:.3f} | "
            f"{classification['mcc']:.3f} |"
        )
    lines.append("")

    lines.append("## 4. Latência de detecção")
    lines.append("")
    lines.append(
        "O drift cresce linearmente até a intensidade máxima em "
        f"{config['ramp_windows']} janelas. A latência é o número da janela "
        "em que o método dispara pela primeira vez. Valores não detectados "
        f"até {config['max_windows']} janelas são censurados."
    )
    lines.append("")
    lines.append("| Cenário | Método | Taxa de detecção | Mediana (janelas) | Média (janelas) |")
    lines.append("|---|---|---:|---:|---:|")
    for scenario_name, scenario in results["latency"].items():
        for method, data in scenario["methods"].items():
            median = (
                f"{data['median_detection_window']:.1f}"
                if data["median_detection_window"] is not None
                else "n/d"
            )
            lines.append(
                f"| {scenario_name} | {METHOD_LABELS.get(method, method)} | "
                f"{data['detection_rate']:.3f} | {median} | "
                f"{data['mean_windows_to_detection']:.2f} |"
            )
    lines.append("")

    lines.append("## 5. Concordância e testes pareados")
    lines.append("")
    lines.append(
        "McNemar compara a acurácia dos métodos nas mesmas amostras. "
        f"Com {len(results['pairwise'])} comparações, o alfa de Bonferroni é "
        f"{config['bonferroni_alpha']:.4f}."
    )
    lines.append("")
    lines.append("| Comparação | Kappa | Concordância | McNemar p | Δ acurácia | IC 95% do Δ |")
    lines.append("|---|---:|---:|---:|---:|---|")
    for comparison, data in results["pairwise"].items():
        ci = data["accuracy_difference_ci"]
        lines.append(
            f"| {comparison.replace('_vs_', ' vs ')} | "
            f"{data['kappa']:.3f} | {data['agreement']:.3f} | "
            f"{data['mcnemar']['p_value']:.4f} | "
            f"{data['accuracy_difference']:+.3f} | "
            f"[{ci['lower']:+.3f}, {ci['upper']:+.3f}] |"
        )
    lines.append("")

    lines.append("## 6. Ranking e leitura dos resultados")
    lines.append("")
    ranking = results["ranking"]
    lines.append(
        "- **AUC:** "
        + " > ".join(METHOD_LABELS[m] for m in ranking["by_auc"])
    )
    lines.append(
        "- **Sensibilidade agregada:** "
        + " > ".join(METHOD_LABELS[m] for m in ranking["by_sensitivity"])
    )
    lines.append(
        "- **Menor taxa de falso positivo:** "
        + " > ".join(METHOD_LABELS[m] for m in ranking["by_false_positive_rate"])
    )
    lines.append(
        "- **Menor latência média:** "
        + " > ".join(METHOD_LABELS[m] for m in ranking["by_latency"])
    )
    lines.append("")

    best_auc = ranking["by_auc"][0]
    most_sensitive = ranking["by_sensitivity"][0]
    most_specific = ranking["by_false_positive_rate"][0]
    fastest = ranking["by_latency"][0]

    lines.append(
        f"O método com maior AUC foi **{METHOD_LABELS[best_auc]}**. "
        f"O mais sensível foi **{METHOD_LABELS[most_sensitive]}**, enquanto "
        f"**{METHOD_LABELS[most_specific]}** apresentou a menor taxa de falso "
        f"positivo. Na simulação sequencial, **{METHOD_LABELS[fastest]}** "
        "detectou o drift mais cedo em média."
    )
    lines.append("")
    lines.append(
        "Observação: o teste KS tende a ser muito sensível com amostras "
        "grandes, detectando diferenças de pequena magnitude; PSI, JS e "
        "Wasserstein capturam melhor a magnitude da mudança. Por isso o "
        "sistema combina os métodos e reporta a severidade, em vez de "
        "depender de um único teste."
    )
    lines.append("")

    lines.append("## 7. Limitações")
    lines.append("")
    lines.append(
        "- Os cenários sintéticos usam distribuições normais; dados reais "
        "(PaySim) têm forte assimetria e valores extremos."
    )
    lines.append(
        "- O p-valor do KS depende do tamanho amostral; comparações entre "
        "janelas de tamanhos diferentes exigem cautela."
    )
    lines.append(
        "- A latência simulada assume drift gradual e janelas independentes."
    )
    lines.append(
        "- A AUC agrega cenários com efeitos de tamanhos diferentes; as "
        "tabelas por cenário devem ser consultadas para decisões finas."
    )
    lines.append("")

    return "\n".join(lines)


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Executa o experimento E3 de comparação de métodos de drift."
    )
    parser.add_argument("--repetitions", type=int, default=200)
    parser.add_argument("--latency-repetitions", type=int, default=50)
    parser.add_argument("--n-reference", type=int, default=1000)
    parser.add_argument("--n-current", type=int, default=500)
    parser.add_argument("--window-size", type=int, default=300)
    parser.add_argument("--max-windows", type=int, default=12)
    parser.add_argument("--ramp-windows", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "results" / "e3",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)

    print("[E3] Executando comparacao de metodos de deteccao de drift...")
    results = run_experiment(
        repetitions=args.repetitions,
        latency_repetitions=args.latency_repetitions,
        n_reference=args.n_reference,
        n_current=args.n_current,
        window_size=args.window_size,
        max_windows=args.max_windows,
        ramp_windows=args.ramp_windows,
        seed=args.seed,
    )
    paths = save_results(results, args.output)

    print("[OK] E3 concluido.")
    for name, path in paths.items():
        print(f"   {name}: {path}")

    print("\nResumo (AUC):")
    for method in results["ranking"]["by_auc"]:
        auc = results["pooled"][method]["auc"]
        print(f"   {METHOD_LABELS[method]:>14}: {auc:.3f}" if auc else f"   {method}: n/d")

    return 0


def _jsonable(value: Any) -> Any:
    """Converte tipos numpy e Paths para JSON."""
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.floating,)):
        number = float(value)
        return None if math.isnan(number) or math.isinf(number) else number
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.ndarray):
        return _jsonable(value.tolist())
    return value


if __name__ == "__main__":
    raise SystemExit(main())
