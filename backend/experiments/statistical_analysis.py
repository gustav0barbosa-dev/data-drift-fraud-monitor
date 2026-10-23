"""
Análise estatística dos resultados experimentais (T2.8).

Utilitários usados pelo experimento E3 e por relatórios:

- intervalos de confiança de Wilson para proporções;
- bootstrap para média/AUC;
- AUC-ROC sem dependência de scikit-learn;
- teste de McNemar para comparar classificadores pareados;
- kappa de Cohen para concordância entre métodos;
- métricas de classificação (sensibilidade, especificidade, F1, MCC etc.).

Todas as funções são puras e recebem arrays/listas, sem acesso a banco.
"""
from __future__ import annotations

from typing import Any, Callable, Mapping, Optional, Sequence

import numpy as np
from scipy import stats


# ----------------------------------------------------------------------
# Intervalos de confiança
# ----------------------------------------------------------------------
def wilson_ci(
    successes: int,
    n: int,
    confidence: float = 0.95,
) -> tuple[float, float]:
    """
    Intervalo de confiança de Wilson para uma proporção binomial.

    Preferível ao intervalo normal quando ``p`` está próximo de 0 ou 1 ou
    quando ``n`` é pequeno.
    """
    if n <= 0:
        return (0.0, 0.0)
    if not 0 <= successes <= n:
        raise ValueError("successes deve estar entre 0 e n")
    if not 0 < confidence < 1:
        raise ValueError("confidence deve estar entre 0 e 1")

    z = float(stats.norm.ppf(1 - (1 - confidence) / 2))
    p = successes / n
    denominator = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / denominator
    margin = (
        z
        * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2))
        / denominator
    )
    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    if successes == 0:
        lower = 0.0
    if successes == n:
        upper = 1.0
    return (float(lower), float(upper))


def bootstrap_ci(
    values: Sequence[float] | np.ndarray,
    statistic: Callable[[np.ndarray], float] = np.mean,
    *,
    n_boot: int = 2000,
    confidence: float = 0.95,
    seed: int = 42,
) -> dict[str, float]:
    """Intervalo de confiança bootstrap percentil para uma estatística."""
    data = np.asarray(values, dtype=float)
    data = data[np.isfinite(data)]
    if data.size == 0:
        return {"estimate": float("nan"), "lower": float("nan"), "upper": float("nan")}

    rng = np.random.default_rng(seed)
    indices = rng.integers(0, data.size, size=(max(int(n_boot), 1), data.size))
    estimates = np.array([statistic(data[idx]) for idx in indices], dtype=float)

    alpha = (1 - confidence) / 2
    lower, upper = np.percentile(estimates, [alpha * 100, (1 - alpha) * 100])
    return {
        "estimate": float(statistic(data)),
        "lower": float(lower),
        "upper": float(upper),
    }


# ----------------------------------------------------------------------
# AUC-ROC
# ----------------------------------------------------------------------
def roc_auc(labels: Sequence[Any], scores: Sequence[float]) -> Optional[float]:
    """
    Calcula a AUC-ROC pela estatística de Mann-Whitney (com empates).

    Returns:
        float ou ``None`` se houver apenas uma classe.
    """
    y = np.asarray(labels, dtype=bool)
    s = np.asarray(scores, dtype=float)
    if y.size != s.size:
        raise ValueError("labels e scores devem ter o mesmo tamanho")

    valid = np.isfinite(s)
    y, s = y[valid], s[valid]

    n_pos = int(y.sum())
    n_neg = int((~y).sum())
    if n_pos == 0 or n_neg == 0:
        return None

    order = np.argsort(s, kind="mergesort")
    sorted_scores = s[order]
    ranks = np.empty(s.size, dtype=float)

    i = 0
    while i < sorted_scores.size:
        j = i
        while j + 1 < sorted_scores.size and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        average_rank = (i + j) / 2 + 1
        ranks[order[i : j + 1]] = average_rank
        i = j + 1

    rank_sum_pos = float(ranks[y].sum())
    u = rank_sum_pos - n_pos * (n_pos + 1) / 2
    return float(u / (n_pos * n_neg))


def bootstrap_auc_ci(
    labels: Sequence[Any],
    scores: Sequence[float],
    *,
    n_boot: int = 1000,
    confidence: float = 0.95,
    seed: int = 42,
) -> dict[str, Optional[float]]:
    """AUC-ROC com intervalo de confiança bootstrap (reamostra pares)."""
    y = np.asarray(labels, dtype=bool)
    s = np.asarray(scores, dtype=float)
    auc = roc_auc(y, s)
    if auc is None:
        return {"estimate": None, "lower": None, "upper": None}

    rng = np.random.default_rng(seed)
    estimates: list[float] = []
    for _ in range(max(int(n_boot), 1)):
        idx = rng.integers(0, y.size, size=y.size)
        value = roc_auc(y[idx], s[idx])
        if value is not None:
            estimates.append(value)

    if not estimates:
        return {"estimate": auc, "lower": None, "upper": None}

    alpha = (1 - confidence) / 2
    lower, upper = np.percentile(estimates, [alpha * 100, (1 - alpha) * 100])
    return {"estimate": auc, "lower": float(lower), "upper": float(upper)}


# ----------------------------------------------------------------------
# Métricas de classificação
# ----------------------------------------------------------------------
def classification_metrics(
    decisions: Sequence[Any],
    labels: Sequence[Any],
) -> dict[str, float | int]:
    """Métricas de classificação binária para decisões de drift."""
    pred = np.asarray(decisions, dtype=bool)
    truth = np.asarray(labels, dtype=bool)
    if pred.size != truth.size:
        raise ValueError("decisions e labels devem ter o mesmo tamanho")

    tp = int(np.sum(pred & truth))
    fp = int(np.sum(pred & ~truth))
    tn = int(np.sum(~pred & ~truth))
    fn = int(np.sum(~pred & truth))

    sensitivity = tp / (tp + fn) if (tp + fn) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    accuracy = (tp + tn) / pred.size if pred.size else 0.0
    f1 = (
        2 * precision * sensitivity / (precision + sensitivity)
        if (precision + sensitivity)
        else 0.0
    )
    mcc_denominator = np.sqrt(
        float((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    )
    mcc = ((tp * tn) - (fp * fn)) / mcc_denominator if mcc_denominator else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "n": int(pred.size),
        "sensitivity": float(sensitivity),
        "specificity": float(specificity),
        "precision": float(precision),
        "accuracy": float(accuracy),
        "f1": float(f1),
        "mcc": float(mcc),
        "false_positive_rate": float(1 - specificity),
        "false_negative_rate": float(1 - sensitivity),
    }


# ----------------------------------------------------------------------
# Testes pareados
# ----------------------------------------------------------------------
def mcnemar_test(
    correct_a: Sequence[Any],
    correct_b: Sequence[Any],
    *,
    exact_threshold: int = 25,
) -> dict[str, Any]:
    """
    Teste de McNemar para dois classificadores avaliados nas mesmas amostras.

    ``correct_a``/``correct_b`` são booleanos indicando acerto de cada método.
    """
    a = np.asarray(correct_a, dtype=bool)
    b = np.asarray(correct_b, dtype=bool)
    if a.size != b.size:
        raise ValueError("As máscaras devem ter o mesmo tamanho")
    if a.size == 0:
        raise ValueError("As máscaras não podem estar vazias")

    disc_a = int(np.sum(a & ~b))  # A acerta, B erra
    disc_b = int(np.sum(~a & b))  # A erra, B acerta
    discordant = disc_a + disc_b

    if discordant == 0:
        return {
            "b": disc_a,
            "c": disc_b,
            "statistic": 0.0,
            "p_value": 1.0,
            "method": "none",
        }

    if discordant < exact_threshold:
        p_value = float(stats.binomtest(min(disc_a, disc_b), discordant, 0.5).pvalue)
        return {
            "b": disc_a,
            "c": disc_b,
            "statistic": float(min(disc_a, disc_b)),
            "p_value": p_value,
            "method": "exact_binomial",
        }

    statistic = (abs(disc_a - disc_b) - 1) ** 2 / discordant
    p_value = float(stats.chi2.sf(statistic, df=1))
    return {
        "b": disc_a,
        "c": disc_b,
        "statistic": float(statistic),
        "p_value": p_value,
        "method": "chi2_corrected",
    }


def cohens_kappa(a: Sequence[Any], b: Sequence[Any]) -> float:
    """Kappa de Cohen para concordância entre duas classificações."""
    first = np.asarray(a, dtype=bool)
    second = np.asarray(b, dtype=bool)
    if first.size != second.size:
        raise ValueError("As classificações devem ter o mesmo tamanho")
    if first.size == 0:
        raise ValueError("As classificações não podem estar vazias")

    observed = float(np.mean(first == second))
    p_first = float(np.mean(first))
    p_second = float(np.mean(second))
    expected = p_first * p_second + (1 - p_first) * (1 - p_second)

    if expected >= 1.0:
        return 1.0 if observed >= 1.0 else 0.0
    return float((observed - expected) / (1 - expected))


def paired_comparison(
    decisions: Mapping[str, Sequence[Any]],
    labels: Sequence[Any],
    *,
    n_boot: int = 1000,
    confidence: float = 0.95,
    seed: int = 42,
) -> dict[str, dict[str, Any]]:
    """
    Compara todos os pares de métodos.

    Retorna, para cada par, kappa, concordância, McNemar e a diferença de
    acurácia com IC bootstrap.
    """
    truth = np.asarray(labels, dtype=bool)
    names = list(decisions)
    output: dict[str, dict[str, Any]] = {}

    for i, name_a in enumerate(names):
        for name_b in names[i + 1 :]:
            pred_a = np.asarray(decisions[name_a], dtype=bool)
            pred_b = np.asarray(decisions[name_b], dtype=bool)

            correct_a = pred_a == truth
            correct_b = pred_b == truth
            diff = correct_a.astype(float) - correct_b.astype(float)

            output[f"{name_a}_vs_{name_b}"] = {
                "kappa": cohens_kappa(pred_a, pred_b),
                "agreement": float(np.mean(pred_a == pred_b)),
                "mcnemar": mcnemar_test(correct_a, correct_b),
                "accuracy_difference": float(np.mean(diff)),
                "accuracy_difference_ci": bootstrap_ci(
                    diff,
                    n_boot=n_boot,
                    confidence=confidence,
                    seed=seed,
                ),
            }

    return output
