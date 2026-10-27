"""
Sistema de alertas de drift.

Responsabilidades (T2.5):

- transformar resultados de drift em alertas com severidade;
- agregar features afetadas em um único alerta por janela;
- persistir alertas no banco (quando uma sessão SQLAlchemy é fornecida);
- evitar duplicidade de alertas dentro de uma janela de cooldown;
- permitir consulta e resolução de alertas.

A camada de avaliação (:func:`build_drift_alerts`) é pura e não depende de
banco de dados. A persistência é opcional, o que permite usar o sistema em
notebooks e experimentos sem PostgreSQL.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping, Optional

from drift.thresholds import (
    DEFAULT_THRESHOLDS,
    DriftThresholds,
    SEVERITY_ORDER,
    max_severity,
)

logger = logging.getLogger(__name__)


@dataclass
class DriftAlert:
    """Alerta de drift pronto para ser persistido ou exibido no dashboard."""

    experiment_id: Optional[int]
    alert_type: str
    severity: str
    message: str
    metadata: dict[str, Any] = field(default_factory=dict)
    triggered_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "experiment_id": self.experiment_id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "metadata": self.metadata,
            "triggered_at": self.triggered_at.isoformat(),
        }


def build_drift_alerts(
    experiment_id: Optional[int],
    feature_results: Mapping[str, Any],
    *,
    window_start: Optional[datetime] = None,
    window_end: Optional[datetime] = None,
    thresholds: Optional[DriftThresholds] = None,
    include_feature_alerts: bool = False,
) -> list[DriftAlert]:
    """
    Converte resultados de drift em alertas.

    Args:
        experiment_id: ID do experimento (pode ser ``None`` em simulações).
        feature_results: Saída de ``DriftDetector.detect_frame`` **ou** um
            mapeamento ``feature -> resultado``.
        window_start/window_end: Janela analisada (opcional).
        thresholds: Limiares usados (default: padrão).
        include_feature_alerts: Se ``True``, gera também um alerta individual
            para cada feature em estado ``critical``.

    Returns:
        Lista de :class:`DriftAlert` (vazia se não houver drift).
    """
    thresholds = thresholds or DEFAULT_THRESHOLDS
    features = _extract_feature_results(feature_results)

    critical: list[str] = []
    warning: list[str] = []
    per_feature: dict[str, dict[str, Any]] = {}

    for name, result in features.items():
        severity = result.get("severity", "none")
        if severity == "none":
            continue

        if result.get("insufficient_data", False):
            # Amostra pequena não deve gerar alerta operacional.
            continue

        if severity == "critical":
            critical.append(name)
        else:
            warning.append(name)

        per_feature[name] = {
            "severity": severity,
            "psi": result.get("psi"),
            "ks_pvalue": result.get("ks_pvalue"),
            "js": result.get("js"),
            "wasserstein_normalized": result.get("wasserstein_normalized"),
            "drift_score": result.get("drift_score"),
        }

    if not critical and not warning:
        return []

    severity = max_severity(*(per_feature[name]["severity"] for name in per_feature))
    affected = critical + warning
    max_score = max(
        (float(per_feature[name].get("drift_score") or 0.0) for name in affected),
        default=0.0,
    )

    metadata: dict[str, Any] = {
        "features": affected,
        "critical_features": critical,
        "warning_features": warning,
        "num_features": len(affected),
        "max_score": round(max_score, 6),
        "per_feature": per_feature,
        "thresholds": thresholds.to_dict(),
    }
    if window_start is not None:
        metadata["window_start"] = _iso(window_start)
    if window_end is not None:
        metadata["window_end"] = _iso(window_end)

    severity_label = {"warning": "moderado", "critical": "crítico"}.get(
        severity, severity
    )
    message = (
        f"Drift {severity_label} detectado em {len(affected)} feature(s): "
        f"{', '.join(affected[:5])}"
    )
    if len(affected) > 5:
        message += f" (+{len(affected) - 5})"

    alerts = [
        DriftAlert(
            experiment_id=experiment_id,
            alert_type="drift_detected",
            severity=severity,
            message=message,
            metadata=metadata,
        )
    ]

    if include_feature_alerts:
        for name in critical:
            alerts.append(
                DriftAlert(
                    experiment_id=experiment_id,
                    alert_type="drift_detected",
                    severity="critical",
                    message=f"Drift crítico na feature '{name}'",
                    metadata={"feature": name, "result": per_feature[name]},
                )
            )

    return alerts


class AlertSystem:
    """
    Avalia, persiste e gerencia alertas de drift.

    Example:
        >>> system = AlertSystem(db_session)
        >>> result = system.process(experiment_id=1, feature_results=drift_result)
        >>> result["created"]
        1
    """

    def __init__(
        self,
        db: Any = None,
        thresholds: Optional[DriftThresholds] = None,
        *,
        cooldown_minutes: int = 60,
        dedupe: bool = True,
    ) -> None:
        self.db = db
        self.thresholds = thresholds or DEFAULT_THRESHOLDS
        self.cooldown = timedelta(minutes=max(int(cooldown_minutes), 0))
        self.dedupe = dedupe

    # ------------------------------------------------------------------
    # Avaliação (sem banco)
    # ------------------------------------------------------------------
    def evaluate(
        self,
        experiment_id: Optional[int],
        feature_results: Mapping[str, Any],
        *,
        window_start: Optional[datetime] = None,
        window_end: Optional[datetime] = None,
        include_feature_alerts: bool = False,
    ) -> list[DriftAlert]:
        """Gera alertas a partir de resultados de drift, sem persistir."""
        return build_drift_alerts(
            experiment_id,
            feature_results,
            window_start=window_start,
            window_end=window_end,
            thresholds=self.thresholds,
            include_feature_alerts=include_feature_alerts,
        )

    # ------------------------------------------------------------------
    # Persistência
    # ------------------------------------------------------------------
    def process(
        self,
        experiment_id: Optional[int],
        feature_results: Mapping[str, Any],
        *,
        window_start: Optional[datetime] = None,
        window_end: Optional[datetime] = None,
        include_feature_alerts: bool = False,
    ) -> dict[str, Any]:
        """
        Avalia e persiste alertas, respeitando cooldown/deduplicação.

        Returns:
            dict com ``created``, ``skipped`` e a lista de alertas criados.
        """
        alerts = self.evaluate(
            experiment_id,
            feature_results,
            window_start=window_start,
            window_end=window_end,
            include_feature_alerts=include_feature_alerts,
        )

        if not alerts:
            return {"created": 0, "skipped": 0, "alerts": []}

        if self.db is None:
            return {
                "created": 0,
                "skipped": 0,
                "alerts": [alert.to_dict() for alert in alerts],
                "persisted": False,
            }

        to_create = alerts
        if self.dedupe and experiment_id is not None:
            to_create = [
                alert
                for alert in alerts
                if not self._should_skip(experiment_id, alert)
            ]

        created_models = []
        for alert in to_create:
            model = self._to_model(alert)
            self.db.add(model)
            created_models.append(model)

        if created_models:
            self.db.commit()
            for model in created_models:
                self.db.refresh(model)

        skipped = len(alerts) - len(created_models)
        if skipped:
            logger.info("🔇 %s alerta(s) suprimido(s) por cooldown/deduplicação", skipped)

        return {
            "created": len(created_models),
            "skipped": skipped,
            "persisted": True,
            "alerts": [_model_to_dict(model) for model in created_models],
        }

    def create_drift_alert(
        self,
        experiment_id: int,
        features: Iterable[str],
        max_score: float,
        *,
        severity: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Any:
        """
        Cria e persiste um alerta de drift (compatível com a versão anterior).

        Mantido para integrações existentes. Prefira :meth:`process`, que
        agrega resultados completos e evita duplicidade.
        """
        if self.db is None:
            raise RuntimeError("create_drift_alert requer uma sessão de banco")

        feature_list = list(features)
        if severity is None:
            severity = "critical" if max_score > 0.5 else "warning"
        if severity not in SEVERITY_ORDER:
            raise ValueError(f"Severidade inválida: {severity!r}")

        alert_metadata = {
            "features": feature_list,
            "max_score": float(max_score),
            "num_features": len(feature_list),
        }
        if metadata:
            alert_metadata.update(metadata)

        alert = self._to_model(
            DriftAlert(
                experiment_id=experiment_id,
                alert_type="drift_detected",
                severity=severity,
                message=(
                    f"Drift detectado em {len(feature_list)} features: "
                    f"{', '.join(feature_list[:5])}"
                ),
                metadata=alert_metadata,
            )
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)

        logger.warning("⚠️ Alerta criado: %s", alert.message)
        return alert

    # ------------------------------------------------------------------
    # Consulta / resolução
    # ------------------------------------------------------------------
    def get_active_alerts(
        self,
        experiment_id: Optional[int] = None,
        *,
        limit: int = 100,
    ) -> list[Any]:
        """Lista alertas de drift não resolvidos."""
        Alert = self._alert_model()
        query = self.db.query(Alert).filter(Alert.is_resolved.is_(False))
        if experiment_id is not None:
            query = query.filter(Alert.experiment_id == experiment_id)
        return (
            query.order_by(Alert.triggered_at.desc())
            .limit(max(1, int(limit)))
            .all()
        )

    def get_alert_history(
        self,
        experiment_id: int,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Any]:
        """Lista o histórico de alertas de um experimento."""
        Alert = self._alert_model()
        return (
            self.db.query(Alert)
            .filter(Alert.experiment_id == experiment_id)
            .order_by(Alert.triggered_at.desc())
            .offset(max(0, int(offset)))
            .limit(max(1, int(limit)))
            .all()
        )

    def resolve_alert(self, alert_id: int, *, resolved: bool = True) -> Optional[Any]:
        """Marca um alerta como resolvido (ou reabre, com ``resolved=False``)."""
        Alert = self._alert_model()
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        if alert is None:
            return None

        alert.is_resolved = bool(resolved)
        alert.resolved_at = datetime.now(timezone.utc) if resolved else None
        self.db.commit()
        self.db.refresh(alert)
        return alert

    # ------------------------------------------------------------------
    # Internos
    # ------------------------------------------------------------------
    def _alert_model(self) -> Any:
        if self.db is None:
            raise RuntimeError("Operação requer uma sessão de banco de dados")
        from db.models import Alert

        return Alert

    def _to_model(self, alert: DriftAlert) -> Any:
        Alert = self._alert_model()
        return Alert(
            experiment_id=alert.experiment_id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            metadata_json=alert.metadata,
            triggered_at=alert.triggered_at,
        )

    def _should_skip(self, experiment_id: int, alert: DriftAlert) -> bool:
        """Evita alertas repetidos dentro do cooldown, salvo escalada."""
        Alert = self._alert_model()
        now = datetime.now(timezone.utc)

        last = (
            self.db.query(Alert)
            .filter(
                Alert.experiment_id == experiment_id,
                Alert.alert_type == alert.alert_type,
                Alert.is_resolved.is_(False),
            )
            .order_by(Alert.triggered_at.desc())
            .first()
        )
        if last is None:
            return False

        triggered = _as_utc(last.triggered_at)
        if triggered is None:
            return False

        within_cooldown = (now - triggered) <= self.cooldown
        escalated = SEVERITY_ORDER.get(alert.severity, 0) > SEVERITY_ORDER.get(
            last.severity, 0
        )

        return within_cooldown and not escalated


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _extract_feature_results(
    feature_results: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Aceita tanto a saída de ``detect_frame`` quanto um mapa de features."""
    if not isinstance(feature_results, Mapping):
        raise TypeError("feature_results deve ser um mapeamento")

    # Aceita também o resultado de uma única chamada DriftDetector.detect().
    if "methods" in feature_results and "severity" in feature_results:
        name = str(feature_results.get("feature_name") or "feature")
        return {name: dict(feature_results)}

    nested = feature_results.get("features")
    if isinstance(nested, Mapping):
        return {
            str(name): dict(result)
            for name, result in nested.items()
            if isinstance(result, Mapping)
        }

    return {
        str(name): dict(result)
        for name, result in feature_results.items()
        if isinstance(result, Mapping)
    }


def _iso(value: datetime) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _model_to_dict(model: Any) -> dict[str, Any]:
    return {
        "id": getattr(model, "id", None),
        "experiment_id": getattr(model, "experiment_id", None),
        "alert_type": getattr(model, "alert_type", None),
        "severity": getattr(model, "severity", None),
        "message": getattr(model, "message", None),
        "metadata": getattr(model, "metadata_json", {}),
        "triggered_at": _iso(getattr(model, "triggered_at", None)),
        "is_resolved": getattr(model, "is_resolved", False),
        "resolved_at": _iso(getattr(model, "resolved_at", None))
        if getattr(model, "resolved_at", None)
        else None,
    }
