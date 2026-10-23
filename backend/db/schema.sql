-- ============================================================
-- DATA DRIFT FRAUD MONITOR - Esquema Completo
-- PostgreSQL 15+
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABELA: experiments
-- Armazena os experimentos científicos realizados
-- ============================================================
CREATE TABLE IF NOT EXISTS experiments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    drift_level VARCHAR(50) NOT NULL 
        CHECK (drift_level IN ('none', 'low', 'moderate', 'high')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    config JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_status 
    ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_drift_level 
    ON experiments(drift_level);
CREATE INDEX IF NOT EXISTS idx_experiments_created_at 
    ON experiments(created_at DESC);

-- ============================================================
-- TABELA: model_versions
-- Armazena as versões dos modelos treinados
-- ============================================================
CREATE TABLE IF NOT EXISTS model_versions (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER NOT NULL 
        REFERENCES experiments(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_model_versions_experiment 
    ON model_versions(experiment_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_active 
    ON model_versions(is_active) WHERE is_active = TRUE;

-- ============================================================
-- TABELA: transactions
-- Armazena as transações processadas (PaySim)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    step INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    old_balance_org NUMERIC(15, 2),
    new_balance_org NUMERIC(15, 2),
    old_balance_dest NUMERIC(15, 2),
    new_balance_dest NUMERIC(15, 2),
    is_fraud BOOLEAN DEFAULT FALSE,
    is_flagged_fraud BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_step 
    ON transactions(step);
CREATE INDEX IF NOT EXISTS idx_transactions_type 
    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_is_fraud 
    ON transactions(is_fraud) WHERE is_fraud = TRUE;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
    ON transactions(created_at DESC);

-- ============================================================
-- TABELA: predictions
-- Armazena as predições do modelo
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions (
    id BIGSERIAL PRIMARY KEY,
    model_version_id INTEGER NOT NULL 
        REFERENCES model_versions(id) ON DELETE CASCADE,
    transaction_id BIGINT NOT NULL 
        REFERENCES transactions(id) ON DELETE CASCADE,
    is_fraud BOOLEAN NOT NULL,
    probability NUMERIC(6, 5) NOT NULL 
        CHECK (probability >= 0 AND probability <= 1),
    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    latency_ms NUMERIC(10, 2)
);

CREATE INDEX IF NOT EXISTS idx_predictions_model 
    ON predictions(model_version_id);
CREATE INDEX IF NOT EXISTS idx_predictions_transaction 
    ON predictions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at 
    ON predictions(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_is_fraud 
    ON predictions(is_fraud) WHERE is_fraud = TRUE;

-- ============================================================
-- TABELA: performance
-- Armazena métricas de desempenho por janela temporal
-- ============================================================
CREATE TABLE IF NOT EXISTS performance (
    id SERIAL PRIMARY KEY,
    model_version_id INTEGER NOT NULL 
        REFERENCES model_versions(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    accuracy NUMERIC(6, 5),
    precision NUMERIC(6, 5),
    recall NUMERIC(6, 5),
    f1_score NUMERIC(6, 5),
    auc_roc NUMERIC(6, 5),
    total_predictions INTEGER DEFAULT 0,
    true_positives INTEGER DEFAULT 0,
    false_positives INTEGER DEFAULT 0,
    true_negatives INTEGER DEFAULT 0,
    false_negatives INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_performance_model 
    ON performance(model_version_id);
CREATE INDEX IF NOT EXISTS idx_performance_window 
    ON performance(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_performance_f1 
    ON performance(f1_score DESC);

-- ============================================================
-- TABELA: drift_metrics
-- Armazena as métricas de drift calculadas por feature
-- ============================================================
CREATE TABLE IF NOT EXISTS drift_metrics (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER NOT NULL 
        REFERENCES experiments(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    psi_value NUMERIC(18, 6),
    ks_value NUMERIC(10, 6),
    ks_pvalue NUMERIC(10, 6),
    js_value NUMERIC(10, 6),
    wasserstein_value NUMERIC(24, 6),
    threshold NUMERIC(10, 6) DEFAULT 0.25,
    is_drift BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_drift_experiment 
    ON drift_metrics(experiment_id);
CREATE INDEX IF NOT EXISTS idx_drift_feature 
    ON drift_metrics(feature_name);
CREATE INDEX IF NOT EXISTS idx_drift_window 
    ON drift_metrics(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_drift_is_drift 
    ON drift_metrics(is_drift) WHERE is_drift = TRUE;
CREATE INDEX IF NOT EXISTS idx_drift_experiment_feature 
    ON drift_metrics(experiment_id, feature_name);

-- ============================================================
-- TABELA: alerts
-- Armazena os alertas disparados pelo sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER 
        REFERENCES experiments(id) ON DELETE CASCADE,
    model_version_id INTEGER 
        REFERENCES model_versions(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL 
        CHECK (alert_type IN (
            'drift_detected', 
            'performance_degradation', 
            'retrain_triggered', 
            'retrain_completed',
            'threshold_exceeded'
        )),
    severity VARCHAR(20) NOT NULL 
        CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_alerts_experiment 
    ON alerts(experiment_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type 
    ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity 
    ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at 
    ON alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved 
    ON alerts(is_resolved) WHERE is_resolved = FALSE;

-- ============================================================
-- TABELA: feature_stats
-- Armazena estatísticas descritivas das features por janela
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_stats (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER NOT NULL 
        REFERENCES experiments(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    mean NUMERIC(15, 6),
    std NUMERIC(15, 6),
    min NUMERIC(15, 6),
    max NUMERIC(15, 6),
    median NUMERIC(15, 6),
    q25 NUMERIC(15, 6),
    q75 NUMERIC(15, 6),
    count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_stats_experiment 
    ON feature_stats(experiment_id);
CREATE INDEX IF NOT EXISTS idx_feature_stats_feature 
    ON feature_stats(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_stats_window 
    ON feature_stats(window_start, window_end);

-- ============================================================
-- TABELA: feature_drift_history (VIEW MATERIALIZADA - opcional)
-- Visão consolidada de drift por feature e janela
-- ============================================================
CREATE OR REPLACE VIEW v_drift_summary AS
SELECT 
    dm.experiment_id,
    e.name AS experiment_name,
    dm.feature_name,
    dm.window_start,
    dm.window_end,
    dm.psi_value,
    dm.ks_value,
    dm.ks_pvalue,
    dm.js_value,
    dm.wasserstein_value,
    dm.is_drift,
    dm.threshold
FROM drift_metrics dm
JOIN experiments e ON e.id = dm.experiment_id
ORDER BY dm.window_start DESC, dm.feature_name;

-- ============================================================
-- TABELA: v_performance_summary (VIEW - opcional)
-- Visão consolidada de performance por modelo
-- ============================================================
CREATE OR REPLACE VIEW v_performance_summary AS
SELECT 
    mv.id AS model_version_id,
    mv.version,
    mv.experiment_id,
    e.name AS experiment_name,
    COUNT(p.id) AS total_windows,
    AVG(p.f1_score) AS avg_f1,
    MIN(p.f1_score) AS min_f1,
    MAX(p.f1_score) AS max_f1,
    AVG(p.accuracy) AS avg_accuracy,
    AVG(p.precision) AS avg_precision,
    AVG(p.recall) AS avg_recall,
    AVG(p.auc_roc) AS avg_auc_roc
FROM model_versions mv
JOIN experiments e ON e.id = mv.experiment_id
LEFT JOIN performance p ON p.model_version_id = mv.id
GROUP BY mv.id, mv.version, mv.experiment_id, e.name
ORDER BY mv.trained_at DESC;

-- ============================================================
-- FUNÇÃO: update_updated_at_column
-- Atualiza automaticamente o campo updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments;
CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNÇÃO: deactivate_previous_models
-- Desativa modelos anteriores quando um novo é ativado
-- ============================================================
CREATE OR REPLACE FUNCTION deactivate_previous_models()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE model_versions
        SET is_active = FALSE
        WHERE experiment_id = NEW.experiment_id
          AND id != NEW.id
          AND is_active = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deactivate_previous_models ON model_versions;
CREATE TRIGGER trg_deactivate_previous_models
    BEFORE INSERT OR UPDATE ON model_versions
    FOR EACH ROW
    EXECUTE FUNCTION deactivate_previous_models();

-- ============================================================
-- FIM DO ESQUEMA
-- ============================================================