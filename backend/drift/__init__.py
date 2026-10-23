"""
Módulo de detecção de drift (Pessoa 2).

Exporta as implementações estatísticas, os limiares e o detector agregador.

Uso típico::

    from drift import DriftDetector

    detector = DriftDetector()
    result = detector.detect(reference, current, feature_name="amount")
    if result["is_drift"]:
        print(result["severity"], result["drifted_features"])
"""
from drift.alert_system import AlertSystem, DriftAlert, build_drift_alerts
from drift.detector import DriftDetector
from drift.js_divergence import (
    calculate_js,
    calculate_js_categorical,
    calculate_js_divergence,
)
from drift.ks_test import calculate_ks, calculate_ks_detailed
from drift.psi import (
    calculate_psi,
    calculate_psi_categorical,
    interpret_psi,
    psi_components,
)
from drift.thresholds import (
    DEFAULT_THRESHOLDS,
    METHOD_NAMES,
    DriftThresholds,
    Severity,
    Threshold,
    max_severity,
    severity_at_least,
)
from drift.wasserstein import (
    calculate_wasserstein,
    calculate_wasserstein_normalized,
)

__all__ = [
    # Detector
    "DriftDetector",
    # PSI
    "calculate_psi",
    "calculate_psi_categorical",
    "interpret_psi",
    "psi_components",
    # KS
    "calculate_ks",
    "calculate_ks_detailed",
    # JS
    "calculate_js",
    "calculate_js_divergence",
    "calculate_js_categorical",
    # Wasserstein
    "calculate_wasserstein",
    "calculate_wasserstein_normalized",
    # Limiares
    "DEFAULT_THRESHOLDS",
    "DriftThresholds",
    "Threshold",
    "METHOD_NAMES",
    "Severity",
    "max_severity",
    "severity_at_least",
    # Alertas
    "AlertSystem",
    "DriftAlert",
    "build_drift_alerts",
]
