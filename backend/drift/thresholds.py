"""
Limiares (thresholds) e classificação de severidade para detecção de drift.

Este módulo é intencionalmente livre de dependências de banco de dados para
poder ser reutilizado pela API, pelos experimentos e por testes unitários.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Literal, Mapping, Optional
import math

Severity = Literal["none", "warning", "critical"]
Direction = Literal["above", "below"]

SEVERITY_ORDER: dict[str, int] = {"none": 0, "warning": 1, "critical": 2}

# Nomes canônicos usados em toda a aplicação.
METHOD_NAMES: tuple[str, ...] = ("psi", "ks", "js", "wasserstein")


def max_severity(*severities: Optional[str]) -> Severity:
    """Retorna a maior severidade informada (ignorando None)."""
    valid = [s for s in severities if s in SEVERITY_ORDER]
    if not valid:
        return "none"
    return max(valid, key=lambda s: SEVERITY_ORDER[s])  # type: ignore[return-value]


def severity_at_least(severity: Optional[str], minimum: str = "critical") -> bool:
    """Indica se ``severity`` é maior ou igual a ``minimum``."""
    return SEVERITY_ORDER.get(severity or "none", 0) >= SEVERITY_ORDER.get(minimum, 0)


@dataclass(frozen=True)
class Threshold:
    """
    Limiar de decisão de um método estatístico.

    ``direction="above"`` indica que valores maiores significam mais drift
    (PSI, JS, Wasserstein). ``direction="below"`` é usado para o p-valor do
    teste KS, em que valores menores indicam mais evidência de drift.

    A classificação é conservadora nos extremos:
    - ``value >= critical`` (ou ``<=`` quando ``below``)  -> critical
    - ``value >= warning``  (ou ``<=`` quando ``below``)  -> warning
    - caso contrário                                     -> none
    """

    warning: float
    critical: float
    direction: Direction = "above"

    def __post_init__(self) -> None:
        if self.direction not in ("above", "below"):
            raise ValueError(f"Direção inválida: {self.direction!r}")
        if not _is_finite(self.warning) or not _is_finite(self.critical):
            raise ValueError("Limiares devem ser números finitos")
        if self.direction == "above" and self.warning > self.critical:
            raise ValueError("warning não pode ser maior que critical (direction='above')")
        if self.direction == "below" and self.warning < self.critical:
            raise ValueError("warning não pode ser menor que critical (direction='below')")

    def classify(self, value: Optional[float]) -> Severity:
        """Classifica um valor em ``none``, ``warning`` ou ``critical``."""
        if value is None or not _is_finite(value):
            return "none"

        if self.direction == "above":
            if value >= self.critical:
                return "critical"
            if value >= self.warning:
                return "warning"
        else:
            if value <= self.critical:
                return "critical"
            if value <= self.warning:
                return "warning"
        return "none"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(
        cls,
        data: Optional[Mapping[str, Any]],
        *,
        default: "Threshold",
    ) -> "Threshold":
        if not data:
            return default
        return cls(
            warning=float(data.get("warning", default.warning)),
            critical=float(data.get("critical", default.critical)),
            direction=data.get("direction", default.direction),  # type: ignore[arg-type]
        )


def _is_finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


@dataclass
class DriftThresholds:
    """
    Conjunto de limiares do sistema de detecção.

    Valores padrão seguem a literatura e práticas de mercado:

    ============  =========  ==========  ==================================
    Método        Warning    Critical    Justificativa
    ============  =========  ==========  ==================================
    PSI           0.10       0.25        <0.10 estável; >0.25 mudança
                                           significativa (Siddiqi, 2006)
    KS (p-valor)  0.10       0.05        alfa = 5% para rejeitar H0
    JS (distância)0.05       0.10        escala 0..1; 0.1 ≈ mudança forte
    Wasserstein   0.10       0.25        versão normalizada (desvios-padrão)
    ============  =========  ==========  ==================================

    O Wasserstein bruto depende da escala da feature. Para decisão usamos a
    distância normalizada pelo desvio-padrão (ou IQR) da referência. O valor
    bruto continua sendo reportado para análise.
    """

    psi: Threshold = field(default_factory=lambda: Threshold(0.10, 0.25, "above"))
    ks: Threshold = field(default_factory=lambda: Threshold(0.10, 0.05, "below"))
    js: Threshold = field(default_factory=lambda: Threshold(0.05, 0.10, "above"))
    wasserstein: Threshold = field(default_factory=lambda: Threshold(0.10, 0.25, "above"))

    # Severidade mínima para considerar que há drift (usada pela API/alertas).
    trigger_severity: Severity = "critical"

    # Número mínimo de observações para calcular os métodos com confiança.
    min_samples: int = 30

    # Número de bins do PSI e da JS.
    psi_bins: int = 10
    js_bins: int = 10

    def get(self, method: str) -> Threshold:
        """Obtém o limiar de um método pelo nome canônico."""
        mapping = {
            "psi": self.psi,
            "ks": self.ks,
            "js": self.js,
            "wasserstein": self.wasserstein,
        }
        try:
            return mapping[method]
        except KeyError as exc:
            raise ValueError(
                f"Método desconhecido: {method!r}. Use um de {METHOD_NAMES}"
            ) from exc

    def classify(self, method: str, value: Optional[float]) -> Severity:
        return self.get(method).classify(value)

    def is_drift(self, severity: Optional[str]) -> bool:
        return severity_at_least(severity, self.trigger_severity)

    def to_dict(self) -> dict[str, Any]:
        return {
            "psi": self.psi.to_dict(),
            "ks": self.ks.to_dict(),
            "js": self.js.to_dict(),
            "wasserstein": self.wasserstein.to_dict(),
            "trigger_severity": self.trigger_severity,
            "min_samples": self.min_samples,
            "psi_bins": self.psi_bins,
            "js_bins": self.js_bins,
        }

    @classmethod
    def from_dict(cls, data: Optional[Mapping[str, Any]]) -> "DriftThresholds":
        """
        Cria limiares a partir de um dicionário parcial.

        Exemplo::

            DriftThresholds.from_dict({
                "psi": {"warning": 0.1, "critical": 0.2},
                "trigger_severity": "warning",
            })
        """
        defaults = cls()
        if not data:
            return defaults

        trigger = data.get("trigger_severity", defaults.trigger_severity)
        if trigger not in SEVERITY_ORDER:
            raise ValueError(f"trigger_severity inválido: {trigger!r}")

        min_samples = int(data.get("min_samples", defaults.min_samples))
        if min_samples < 2:
            raise ValueError("min_samples deve ser >= 2")

        psi_bins = int(data.get("psi_bins", defaults.psi_bins))
        js_bins = int(data.get("js_bins", defaults.js_bins))
        if psi_bins < 2:
            raise ValueError("psi_bins deve ser >= 2")
        if js_bins < 2:
            raise ValueError("js_bins deve ser >= 2")

        return cls(
            psi=Threshold.from_dict(data.get("psi"), default=defaults.psi),
            ks=Threshold.from_dict(data.get("ks"), default=defaults.ks),
            js=Threshold.from_dict(data.get("js"), default=defaults.js),
            wasserstein=Threshold.from_dict(
                data.get("wasserstein"), default=defaults.wasserstein
            ),
            trigger_severity=trigger,  # type: ignore[arg-type]
            min_samples=min_samples,
            psi_bins=psi_bins,
            js_bins=js_bins,
        )


# Limiares padrão compartilhados (imutável na prática: não altere em runtime).
DEFAULT_THRESHOLDS = DriftThresholds()
