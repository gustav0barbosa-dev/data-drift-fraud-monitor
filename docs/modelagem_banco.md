2.1 Diagrama Entidade-Relacionamento (ER)
text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   experiments   │       │  model_versions │       │   predictions   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │──┐    │ id (PK)         │
│ name            │  │    │ experiment_id   │  │    │ model_version_id│
│ description     │  │    │ version         │  │    │ transaction_id  │
│ drift_level     │  └───>│ model_path      │  └───>│ is_fraud        │
│ status          │       │ trained_at      │       │ probability     │
│ started_at      │       │ metrics (JSON)  │       │ predicted_at    │
│ finished_at     │       │ is_active       │       │ latency_ms      │
│ config (JSON)   │       └─────────────────┘       └─────────────────┘
└─────────────────┘                │
         │                         │
         │                         ▼
         │                ┌─────────────────┐
         │                │  performance    │
         │                ├─────────────────┤
         │                │ id (PK)         │
         │                │ model_version_id│
         │                │ window_start    │
         │                │ window_end      │
         │                │ accuracy        │
         │                │ precision       │
         │                │ recall          │
         │                │ f1_score        │
         │                │ auc_roc         │
         │                └─────────────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    alerts       │       │  drift_metrics  │       │  transactions   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ experiment_id   │       │ experiment_id   │       │ step            │
│ model_version_id│       │ window_start    │       │ type            │
│ alert_type      │       │ window_end      │       │ amount          │
│ severity        │       │ feature_name    │       │ old_balance_org │
│ message         │       │ psi_value       │       │ new_balance_org │
│ triggered_at    │       │ ks_value        │       │ old_balance_dest│
│ is_resolved     │       │ js_value        │       │ new_balance_dest│
│ resolved_at     │       │ wasserstein_val │       │ is_fraud        │
└─────────────────┘       │ threshold       │       │ is_flagged_fraud│
                          │ is_drift        │       │ created_at      │
                          └─────────────────┘       └─────────────────┘



2.2 Esquema SQL Completo

-- ============================================================
-- TABELA: experiments
-- Armazena os experimentos científicos realizados
-- ============================================================
CREATE TABLE experiments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    drift_level VARCHAR(50) NOT NULL CHECK (drift_level IN ('none', 'low', 'moderate', 'high')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    config JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_drift_level ON experiments(drift_level);

-- ============================================================
-- TABELA: model_versions
-- Armazena as versões dos modelos treinados
-- ============================================================
CREATE TABLE model_versions (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    model_path VARCHAR(500) NOT NULL,
    model_type VARCHAR(100) DEFAULT 'XGBoost',
    hyperparameters JSONB DEFAULT '{}',
    training_metrics JSONB DEFAULT '{}',
    trained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(experiment_id, version)
);

CREATE INDEX idx_model_versions_experiment ON model_versions(experiment_id);
CREATE INDEX idx_model_versions_active ON model_versions(is_active);

-- ============================================================
-- TABELA: transactions
-- Armazena as transações processadas (PaySim)
-- ============================================================
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    step INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    old_balance_org DECIMAL(15, 2),
    new_balance_org DECIMAL(15, 2),
    old_balance_dest DECIMAL(15, 2),
    new_balance_dest DECIMAL(15, 2),
    is_fraud BOOLEAN DEFAULT FALSE,
    is_flagged_fraud BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_step ON transactions(step);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_is_fraud ON transactions(is_fraud);

-- ============================================================
-- TABELA: predictions
-- Armazena as predições do modelo
-- ============================================================
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    model_version_id INTEGER REFERENCES model_versions(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    is_fraud BOOLEAN NOT NULL,
    probability DECIMAL(5, 4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    latency_ms DECIMAL(10, 2)
);

CREATE INDEX idx_predictions_model ON predictions(model_version_id);
CREATE INDEX idx_predictions_transaction ON predictions(transaction_id);
CREATE INDEX idx_predictions_predicted_at ON predictions(predicted_at);

-- ============================================================
-- TABELA: performance
-- Armazena métricas de desempenho por janela temporal
-- ============================================================
CREATE TABLE performance (
    id SERIAL PRIMARY KEY,
    model_version_id INTEGER REFERENCES model_versions(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    accuracy DECIMAL(5, 4),
    precision DECIMAL(5, 4),
    recall DECIMAL(5, 4),
    f1_score DECIMAL(5, 4),
    auc_roc DECIMAL(5, 4),
    total_predictions INTEGER DEFAULT 0,
    true_positives INTEGER DEFAULT 0,
    false_positives INTEGER DEFAULT 0,
    true_negatives INTEGER DEFAULT 0,
    false_negatives INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_performance_model ON performance(model_version_id);
CREATE INDEX idx_performance_window ON performance(window_start, window_end);

-- ============================================================
-- TABELA: drift_metrics
-- Armazena as métricas de drift calculadas por feature
-- ============================================================
CREATE TABLE drift_metrics (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    psi_value DECIMAL(10, 6),
    ks_value DECIMAL(10, 6),
    ks_pvalue DECIMAL(10, 6),
    js_value DECIMAL(10, 6),
    wasserstein_value DECIMAL(10, 6),
    threshold DECIMAL(10, 6),
    is_drift BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_drift_experiment ON drift_metrics(experiment_id);
CREATE INDEX idx_drift_feature ON drift_metrics(feature_name);
CREATE INDEX idx_drift_window ON drift_metrics(window_start, window_end);
CREATE INDEX idx_drift_is_drift ON drift_metrics(is_drift);

-- ============================================================
-- TABELA: alerts
-- Armazena os alertas disparados pelo sistema
-- ============================================================
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    model_version_id INTEGER REFERENCES model_versions(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('drift_detected', 'performance_degradation', 'retrain_triggered', 'retrain_completed')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_alerts_experiment ON alerts(experiment_id);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_triggered_at ON alerts(triggered_at);

-- ============================================================
-- TABELA: feature_stats
-- Armazena estatísticas descritivas das features por janela
-- ============================================================
CREATE TABLE feature_stats (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    mean DECIMAL(15, 6),
    std DECIMAL(15, 6),
    min DECIMAL(15, 6),
    max DECIMAL(15, 6),
    median DECIMAL(15, 6),
    q25 DECIMAL(15, 6),
    q75 DECIMAL(15, 6),
    count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feature_stats_experiment ON feature_stats(experiment_id);
CREATE INDEX idx_feature_stats_feature ON feature_stats(feature_name);

-- ============================================================
-- TRIGGERS para updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();