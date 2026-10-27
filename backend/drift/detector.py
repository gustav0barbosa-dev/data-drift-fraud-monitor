"""
Detector de drift que orquestra PSI, KS, Jensen-Shannon e Wasserstein.

A classe :class:`DriftDetector` é o ponto de entrada único do módulo de
drift. Ela:

- limpa os dados (remove NaN/infinitos);
- detecta automaticamente features numéricas e categóricas;
- calcula todos os métodos disponíveis;
- classifica cada método e o resultado agregado em ``none``, ``warning``
  ou ``critical`` de acordo com :class:`drift.thresholds.DriftThresholds`;
- devolve um dicionário serializável, pronto para a API e para os
  experimentos.

O detector não acessa banco de dados, o que o torna testável de forma
isolada e reutilizável pela Pessoa 1 (simuladores) e pela Pessoa 3 (API).
"""
from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional, Sequence

import numpy as np

from drift.js_divergence import calculate_js, calculate_js_categorical
from drift.ks_test import calculate_ks
from drift.psi import calculate_psi, calculate_psi_categorical
from drift.thresholds import (
    DEFAULT_THRESHOLDS,
    METHOD_NAMES,
    DriftThresholds,
    max_severity,
    severity_at_least,
)
from drift.wasserstein import calculate_wasserstein, calculate_wasserstein_normalized


class DriftDetector:
    """Calcula e classifica drift entre duas amostras."""

    def __init__(
        self,
        thresholds: Optional[DriftThresholds] = None,
        methods: Optional[Iterable[str]] = None,
    ) -> None:
        self.thresholds = thresholds or DEFAULT_THRESHOLDS
        self.methods = tuple(methods) if methods else METHOD_NAMES
        invalid = [m for m in self.methods if m not in METHOD_NAMES]
        if invalid:
            raise ValueError(
                f"Métodos inválidos: {invalid}. Use um de {METHOD_NAMES}"
            )

    # ------------------------------------------------------------------
    # API principal
    # ------------------------------------------------------------------
    def detect(
        self,
        reference: Any,
        current: Any,
        *,
        feature_name: Optional[str] = None,
        categorical: Optional[bool] = None,
        methods: Optional[Iterable[str]] = None,
    ) -> dict[str, Any]:
        """
        Detecta drift entre duas amostras de uma feature.

        Args:
            reference: Valores de referência (treinamento).
            current: Valores atuais (produção).
            feature_name: Nome opcional da feature.
            categorical: Força tratamento categórico (``True``/``False``).
                Se ``None``, infere pelo dtype.
            methods: Subconjunto de métodos a calcular.

        Returns:
            dict serializável com resultados por método, severidade e
            indicador agregado de drift.
        """
        selected = tuple(methods) if methods else self.methods
        invalid = [m for m in selected if m not in METHOD_NAMES]
        if invalid:
            raise ValueError(f"Métodos inválidos: {invalid}")

        ref_raw = np.asarray(reference)
        cur_raw = np.asarray(current)

        if categorical is None:
            is_categorical = _looks_categorical(ref_raw) or _looks_categorical(cur_raw)
        else:
            is_categorical = bool(categorical)

        warnings: list[str] = []

        if is_categorical:
            ref_values = _clean_categorical(ref_raw)
            cur_values = _clean_categorical(cur_raw)
        else:
            ref_values = _clean_numeric(ref_raw, "reference")
            cur_values = _clean_numeric(cur_raw, "current")

        n_ref = int(ref_values.size)
        n_cur = int(cur_values.size)

        if n_ref == 0 or n_cur == 0:
            raise ValueError("As amostras de referência e atual não podem estar vazias")

        min_samples = self.thresholds.min_samples
        insufficient_data = n_ref < min_samples or n_cur < min_samples
        if insufficient_data:
            warnings.append(
                f"Amostra insuficiente: referência={n_ref}, atual={n_cur}, "
                f"mínimo={min_samples}. O resultado não deve disparar alertas."
            )

        method_results: dict[str, dict[str, Any]] = {}

        for method in selected:
            if is_categorical and method not in ("psi", "js"):
                method_results[method] = {
                    "available": False,
                    "reason": "Método não aplicável a variáveis categóricas",
                    "severity": "none",
                    "is_drift": False,
                }
                continue

            try:
                result = self._run_method(
                    method, ref_values, cur_values, is_categorical
                )
            except Exception as exc:  # pragma: no cover - defensivo
                warnings.append(f"Falha ao calcular {method}: {exc}")
                method_results[method] = {
                    "available": False,
                    "reason": str(exc),
                    "severity": "none",
                    "is_drift": False,
                }
                continue

            severity = self.thresholds.classify(method, result["value"])
            result["severity"] = severity
            result["is_drift"] = severity_at_least(
                severity, self.thresholds.trigger_severity
            )
            method_results[method] = result

        overall_severity = max_severity(
            *(result.get("severity") for result in method_results.values())
        )
        is_drift = self.thresholds.is_drift(overall_severity) and not insufficient_data

        flat = _flatten_results(method_results)
        drift_score = _drift_score(method_results, is_categorical)

        return {
            "feature_name": feature_name,
            "n_reference": n_ref,
            "n_current": n_cur,
            "categorical": is_categorical,
            "insufficient_data": insufficient_data,
            "methods": method_results,
            "psi": flat.get("psi"),
            "ks_stat": flat.get("ks_stat"),
            "ks_pvalue": flat.get("ks_pvalue"),
            "js": flat.get("js"),
            "wasserstein": flat.get("wasserstein"),
            "wasserstein_normalized": flat.get("wasserstein_normalized"),
            "severity": overall_severity,
            "is_drift": bool(is_drift),
            "drift_score": float(drift_score),
            "warnings": warnings,
        }

    def detect_frame(
        self,
        reference_frame: Any,
        current_frame: Any,
        *,
        features: Optional[Sequence[str]] = None,
        categorical_features: Optional[Sequence[str]] = None,
        exclude: Optional[Sequence[str]] = None,
    ) -> dict[str, Any]:
        """
        Detecta drift para múltiplas features de dois DataFrames.

        Args:
            reference_frame: DataFrame de referência.
            current_frame: DataFrame atual.
            features: Lista explícita de features (default: interseção das
                colunas dos dois DataFrames, excluindo ``exclude``).
            categorical_features: Features que devem ser tratadas como
                categóricas.
            exclude: Colunas a ignorar (ex.: ``id``, ``created_at``).

        Returns:
            dict com ``features`` (resultado por feature), ``drifted_features``,
            ``overall_drift``, ``max_severity`` e ``max_drift_score``.
        """
        excluded = set(exclude or [])
        categorical_set = set(categorical_features or [])

        if features is None:
            ref_columns = list(getattr(reference_frame, "columns", []))
            cur_columns = list(getattr(current_frame, "columns", []))
            features = [c for c in ref_columns if c in cur_columns and c not in excluded]
        else:
            features = [f for f in features if f not in excluded]

        results: dict[str, dict[str, Any]] = {}
        for feature in features:
            try:
                ref_values = reference_frame[feature]
                cur_values = current_frame[feature]
            except (KeyError, TypeError):
                continue

            try:
                results[feature] = self.detect(
                    ref_values,
                    cur_values,
                    feature_name=feature,
                    categorical=feature in categorical_set if categorical_set else None,
                )
            except (TypeError, ValueError) as exc:
                results[feature] = _invalid_result(feature, ref_values, cur_values, str(exc))

        drifted = [name for name, result in results.items() if result["is_drift"]]
        overall_severity = max_severity(
            *(result["severity"] for result in results.values())
        )
        max_score = max(
            (result["drift_score"] for result in results.values()), default=0.0
        )

        return {
            "features": results,
            "feature_names": list(results.keys()),
            "drifted_features": drifted,
            "n_features": len(results),
            "overall_drift": bool(drifted),
            "max_severity": overall_severity,
            "max_drift_score": float(max_score),
        }

    # ------------------------------------------------------------------
    # Internos
    # ------------------------------------------------------------------
    def _run_method(
        self,
        method: str,
        reference: np.ndarray,
        current: np.ndarray,
        categorical: bool,
    ) -> dict[str, Any]:
        threshold = self.thresholds.get(method)

        if method == "psi":
            value = (
                calculate_psi_categorical(reference, current)
                if categorical
                else calculate_psi(
                    reference, current, bins=self.thresholds.psi_bins
                )
            )
            return _method_payload(value, value, threshold)

        if method == "js":
            value = (
                calculate_js_categorical(reference, current, bias_correction=True)
                if categorical
                else calculate_js(
                    reference,
                    current,
                    bins=self.thresholds.js_bins,
                    bias_correction=True,
                )
            )
            return _method_payload(value, value, threshold)

        if method == "ks":
            statistic, pvalue = calculate_ks(reference, current)
            return _method_payload(pvalue, statistic, threshold)

        if method == "wasserstein":
            raw = calculate_wasserstein(reference, current)
            normalized = calculate_wasserstein_normalized(reference, current)
            payload = _method_payload(normalized, raw, threshold)
            payload["raw_value"] = raw
            return payload

        raise ValueError(f"Método desconhecido: {method!r}")


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _method_payload(value: float, statistic: float, threshold: Any) -> dict[str, Any]:
    return {
        "available": True,
        "value": float(value),
        "statistic": float(statistic),
        "threshold": float(threshold.critical),
        "warning_threshold": float(threshold.warning),
        "direction": threshold.direction,
    }


def _flatten_results(method_results: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    flat: dict[str, Any] = {
        "psi": None,
        "ks_stat": None,
        "ks_pvalue": None,
        "js": None,
        "wasserstein": None,
        "wasserstein_normalized": None,
    }

    psi = method_results.get("psi")
    if psi and psi.get("available"):
        flat["psi"] = psi["value"]

    ks = method_results.get("ks")
    if ks and ks.get("available"):
        flat["ks_stat"] = ks["statistic"]
        flat["ks_pvalue"] = ks["value"]

    js = method_results.get("js")
    if js and js.get("available"):
        flat["js"] = js["value"]

    wasserstein = method_results.get("wasserstein")
    if wasserstein and wasserstein.get("available"):
        flat["wasserstein"] = wasserstein.get("raw_value", wasserstein["statistic"])
        flat["wasserstein_normalized"] = wasserstein["value"]

    return flat


def _drift_score(
    method_results: Mapping[str, Mapping[str, Any]], categorical: bool
) -> float:
    """
    Score agregado de magnitude (não é uma probabilidade).

    Usa PSI, estatística D do KS, distância JS e Wasserstein normalizado.
    O maior valor é reportado para ordenar features por criticidade.
    """
    scores: list[float] = []

    psi = method_results.get("psi")
    if psi and psi.get("available"):
        scores.append(float(psi["value"]))

    ks = method_results.get("ks")
    if ks and ks.get("available"):
        scores.append(float(ks["statistic"]))

    js = method_results.get("js")
    if js and js.get("available"):
        scores.append(float(js["value"]))

    wasserstein = method_results.get("wasserstein")
    if wasserstein and wasserstein.get("available"):
        scores.append(float(wasserstein["value"]))

    return max(scores, default=0.0)


def _looks_categorical(array: np.ndarray) -> bool:
    """Heurística de tipo para decidir entre numérico e categórico."""
    if array.size == 0:
        return False
    if array.dtype.kind in ("U", "S", "b", "M", "m"):
        return True
    if array.dtype.kind == "O":
        # Objetos podem ser Decimal/None; tenta converter toda a amostra.
        try:
            np.asarray(array, dtype=float)
        except (TypeError, ValueError):
            return True
    return False


def _clean_numeric(array: np.ndarray, name: str) -> np.ndarray:
    if array.ndim == 0:
        array = array.reshape(1)
    elif array.ndim > 1:
        array = array.ravel()

    try:
        array = array.astype(float)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{name} deve conter apenas valores numéricos") from exc

    return array[np.isfinite(array)]


def _clean_categorical(array: np.ndarray) -> np.ndarray:
    if array.ndim > 1:
        array = array.ravel()

    values = []
    for value in array.tolist():
        if value is None:
            continue
        if isinstance(value, float) and np.isnan(value):
            continue
        values.append(value)

    return np.asarray(values, dtype=object)


def _invalid_result(
    feature: str,
    reference: Any,
    current: Any,
    reason: str,
) -> dict[str, Any]:
    """Resultado neutro para uma feature que não pôde ser processada."""
    return {
        "feature_name": feature,
        "n_reference": _safe_size(reference),
        "n_current": _safe_size(current),
        "categorical": False,
        "insufficient_data": True,
        "methods": {},
        "psi": None,
        "ks_stat": None,
        "ks_pvalue": None,
        "js": None,
        "wasserstein": None,
        "wasserstein_normalized": None,
        "severity": "none",
        "is_drift": False,
        "drift_score": 0.0,
        "warnings": [reason],
    }


def _safe_size(values: Any) -> int:
    try:
        return int(np.asarray(values).size)
    except Exception:  # pragma: no cover - defensivo
        return 0
