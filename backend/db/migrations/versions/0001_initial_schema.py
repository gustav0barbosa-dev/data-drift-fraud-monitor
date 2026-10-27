"""initial schema

Cria o esquema inicial do banco (8 tabelas + índices) a partir do metadata dos
modelos SQLAlchemy, além das funções, triggers e views que o ``schema.sql``
define. Assim o fluxo "somente Alembic" produz o mesmo banco que o init do
container.

A migration é idempotente (``checkfirst=True`` + ``CREATE OR REPLACE``): bancos
já inicializados pelo ``backend/db/schema.sql`` recebem apenas o carimbo da
versão no ``alembic_version``.

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union

from alembic import op

from db.database import Base
import db.models  # noqa: F401  (registra as tabelas no metadata)

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ============================================================
# Funções e triggers (espelham backend/db/schema.sql)
# ============================================================
FUNCTIONS_AND_TRIGGERS = (
    """
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """,
    """
    DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments;
    CREATE TRIGGER update_experiments_updated_at
        BEFORE UPDATE ON experiments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    """,
    """
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
    """,
    """
    DROP TRIGGER IF EXISTS trg_deactivate_previous_models ON model_versions;
    CREATE TRIGGER trg_deactivate_previous_models
        BEFORE INSERT OR UPDATE ON model_versions
        FOR EACH ROW
        EXECUTE FUNCTION deactivate_previous_models();
    """,
)

VIEWS = (
    """
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
    """,
    """
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
    """,
)


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)

    for statement in FUNCTIONS_AND_TRIGGERS:
        op.execute(statement)

    for statement in VIEWS:
        op.execute(statement)


def downgrade() -> None:
    for view in ("v_performance_summary", "v_drift_summary"):
        op.execute(f"DROP VIEW IF EXISTS {view}")

    op.execute("DROP TRIGGER IF EXISTS trg_deactivate_previous_models ON model_versions")
    op.execute("DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments")
    op.execute("DROP FUNCTION IF EXISTS deactivate_previous_models()")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
