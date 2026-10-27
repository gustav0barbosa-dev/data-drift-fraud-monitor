"""
Modelos SQLAlchemy da aplicação.
Mapeiam as tabelas do banco para classes Python.
"""
from sqlalchemy import (
    Column, Integer, BigInteger, String, Boolean, 
    Numeric, DateTime, Text, ForeignKey, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from db.database import Base


class Experiment(Base):
    """Modelo de experimento científico."""
    __tablename__ = "experiments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    description = Column(Text)
    drift_level = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    config = Column(JSONB, default={})
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relacionamentos
    model_versions = relationship("ModelVersion", back_populates="experiment", cascade="all, delete-orphan")
    drift_metrics = relationship("DriftMetric", back_populates="experiment", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="experiment", cascade="all, delete-orphan")
    feature_stats = relationship("FeatureStats", back_populates="experiment", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint(
            "drift_level IN ('none', 'low', 'moderate', 'high')",
            name="ck_experiments_drift_level"
        ),
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed')",
            name="ck_experiments_status"
        ),
    )
    
    def __repr__(self):
        return f"<Experiment(id={self.id}, name='{self.name}', drift_level='{self.drift_level}')>"


class ModelVersion(Base):
    """Modelo de versão de modelo treinado."""
    __tablename__ = "model_versions"
    
    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    version = Column(String(50), nullable=False)
    model_path = Column(String(500), nullable=False)
    model_type = Column(String(100), default="XGBoost")
    hyperparameters = Column(JSONB, default={})
    training_metrics = Column(JSONB, default={})
    trained_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relacionamentos
    experiment = relationship("Experiment", back_populates="model_versions")
    predictions = relationship("Prediction", back_populates="model_version", cascade="all, delete-orphan")
    performances = relationship("Performance", back_populates="model_version", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="model_version")
    
    __table_args__ = (
        Index("idx_model_versions_experiment", "experiment_id"),
        Index("idx_model_versions_active", "is_active", postgresql_where=(is_active == True)),
    )
    
    def __repr__(self):
        return f"<ModelVersion(id={self.id}, version='{self.version}', is_active={self.is_active})>"


class Transaction(Base):
    """Modelo de transação financeira."""
    __tablename__ = "transactions"
    
    id = Column(BigInteger, primary_key=True, index=True)
    step = Column(Integer, nullable=False)
    type = Column(String(50), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    old_balance_org = Column(Numeric(15, 2))
    new_balance_org = Column(Numeric(15, 2))
    old_balance_dest = Column(Numeric(15, 2))
    new_balance_dest = Column(Numeric(15, 2))
    is_fraud = Column(Boolean, default=False)
    is_flagged_fraud = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relacionamentos
    predictions = relationship("Prediction", back_populates="transaction", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_transactions_step", "step"),
        Index("idx_transactions_type", "type"),
        Index("idx_transactions_is_fraud", "is_fraud", postgresql_where=(is_fraud == True)),
    )
    
    def __repr__(self):
        return f"<Transaction(id={self.id}, step={self.step}, amount={self.amount}, is_fraud={self.is_fraud})>"


class Prediction(Base):
    """Modelo de predição do modelo."""
    __tablename__ = "predictions"
    
    id = Column(BigInteger, primary_key=True, index=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id", ondelete="CASCADE"), nullable=False)
    transaction_id = Column(BigInteger, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    is_fraud = Column(Boolean, nullable=False)
    probability = Column(Numeric(6, 5), nullable=False)
    predicted_at = Column(DateTime(timezone=True), server_default=func.now())
    latency_ms = Column(Numeric(10, 2))
    
    # Relacionamentos
    model_version = relationship("ModelVersion", back_populates="predictions")
    transaction = relationship("Transaction", back_populates="predictions")
    
    __table_args__ = (
        CheckConstraint("probability >= 0 AND probability <= 1", name="ck_predictions_probability"),
        Index("idx_predictions_model", "model_version_id"),
        Index("idx_predictions_transaction", "transaction_id"),
        Index("idx_predictions_predicted_at", "predicted_at"),
    )
    
    def __repr__(self):
        return f"<Prediction(id={self.id}, is_fraud={self.is_fraud}, probability={self.probability})>"


class Performance(Base):
    """Modelo de métricas de desempenho por janela."""
    __tablename__ = "performance"
    
    id = Column(Integer, primary_key=True, index=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id", ondelete="CASCADE"), nullable=False)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)
    accuracy = Column(Numeric(6, 5))
    precision = Column(Numeric(6, 5))
    recall = Column(Numeric(6, 5))
    f1_score = Column(Numeric(6, 5))
    auc_roc = Column(Numeric(6, 5))
    total_predictions = Column(Integer, default=0)
    true_positives = Column(Integer, default=0)
    false_positives = Column(Integer, default=0)
    true_negatives = Column(Integer, default=0)
    false_negatives = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relacionamentos
    model_version = relationship("ModelVersion", back_populates="performances")
    
    __table_args__ = (
        CheckConstraint("window_end > window_start", name="ck_performance_window"),
        Index("idx_performance_model", "model_version_id"),
        Index("idx_performance_window", "window_start", "window_end"),
    )
    
    def __repr__(self):
        return f"<Performance(id={self.id}, f1_score={self.f1_score}, window={self.window_start}-{self.window_end})>"


class DriftMetric(Base):
    """Modelo de métrica de drift por feature."""
    __tablename__ = "drift_metrics"
    
    id = Column(BigInteger, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)
    feature_name = Column(String(255), nullable=False)
    psi_value = Column(Numeric(18, 6))
    ks_value = Column(Numeric(10, 6))
    ks_pvalue = Column(Numeric(10, 6))
    js_value = Column(Numeric(10, 6))
    wasserstein_value = Column(Numeric(24, 6))
    threshold = Column(Numeric(10, 6), default=0.25)
    is_drift = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relacionamentos
    experiment = relationship("Experiment", back_populates="drift_metrics")
    
    __table_args__ = (
        CheckConstraint("window_end > window_start", name="ck_drift_window"),
        Index("idx_drift_experiment", "experiment_id"),
        Index("idx_drift_feature", "feature_name"),
        Index("idx_drift_window", "window_start", "window_end"),
        Index("idx_drift_experiment_feature", "experiment_id", "feature_name"),
    )
    
    def __repr__(self):
        return f"<DriftMetric(id={self.id}, feature='{self.feature_name}', is_drift={self.is_drift})>"


class Alert(Base):
    """Modelo de alerta do sistema."""
    __tablename__ = "alerts"
    
    id = Column(BigInteger, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"))
    model_version_id = Column(Integer, ForeignKey("model_versions.id", ondelete="CASCADE"))
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    metadata_json = Column("metadata", JSONB, default={})
    triggered_at = Column(DateTime(timezone=True), server_default=func.now())
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))
    
    # Relacionamentos
    experiment = relationship("Experiment", back_populates="alerts")
    model_version = relationship("ModelVersion", back_populates="alerts")
    
    __table_args__ = (
        CheckConstraint(
            "alert_type IN ('drift_detected', 'performance_degradation', "
            "'retrain_triggered', 'retrain_completed', 'threshold_exceeded')",
            name="ck_alerts_type"
        ),
        CheckConstraint(
            "severity IN ('info', 'warning', 'critical')",
            name="ck_alerts_severity"
        ),
        Index("idx_alerts_experiment", "experiment_id"),
        Index("idx_alerts_type", "alert_type"),
        Index("idx_alerts_severity", "severity"),
        Index("idx_alerts_triggered_at", "triggered_at"),
    )
    
    def __repr__(self):
        return f"<Alert(id={self.id}, type='{self.alert_type}', severity='{self.severity}')>"


class FeatureStats(Base):
    """Modelo de estatísticas descritivas das features."""
    __tablename__ = "feature_stats"
    
    id = Column(BigInteger, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)
    feature_name = Column(String(255), nullable=False)
    mean = Column(Numeric(15, 6))
    std = Column(Numeric(15, 6))
    min = Column(Numeric(15, 6))
    max = Column(Numeric(15, 6))
    median = Column(Numeric(15, 6))
    q25 = Column(Numeric(15, 6))
    q75 = Column(Numeric(15, 6))
    count = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relacionamentos
    experiment = relationship("Experiment", back_populates="feature_stats")
    
    __table_args__ = (
        Index("idx_feature_stats_experiment", "experiment_id"),
        Index("idx_feature_stats_feature", "feature_name"),
    )
    
    def __repr__(self):
        return f"<FeatureStats(id={self.id}, feature='{self.feature_name}', mean={self.mean})>"