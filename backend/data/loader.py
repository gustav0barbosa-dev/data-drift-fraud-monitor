"""
Carregamento do dataset PaySim (T1.1 / T1.2).

O PaySim usado no projeto tem as colunas originais em camelCase::

    step, type, amount, nameOrig, oldbalanceOrg, newbalanceOrig,
    nameDest, oldbalanceDest, newbalanceDest, isFraud, isFlaggedFraud

Aqui elas são normalizadas para o snake_case usado pelo restante da plataforma
(ORM, API e features)::

    step, type, amount, name_orig, old_balance_org, new_balance_org,
    name_dest, old_balance_dest, new_balance_dest, is_fraud, is_flagged_fraud

Quando o CSV não está disponível, um gerador sintético determinístico produz
transações com o mesmo contrato e padrões de fraude do PaySim. Isso mantém o
pipeline (treino, experimentos E1/E2/E4 e retreinamento) reproduzível em
qualquer máquina, sem depender do download do dataset.

Uso::

    cd backend
    python -m data.loader --rows 50000 --out ../data/paysim_sample.csv
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent

# Ordem das colunas no dataset normalizado.
PAYSIM_COLUMNS = [
    "step",
    "type",
    "amount",
    "name_orig",
    "old_balance_org",
    "new_balance_org",
    "name_dest",
    "old_balance_dest",
    "new_balance_dest",
    "is_fraud",
    "is_flagged_fraud",
]

# Colunas originais (camelCase) -> normalizadas (snake_case).
COLUMN_MAP = {
    "nameOrig": "name_orig",
    "oldbalanceOrg": "old_balance_org",
    "newbalanceOrig": "new_balance_org",
    "nameDest": "name_dest",
    "oldbalanceDest": "old_balance_dest",
    "newbalanceDest": "new_balance_dest",
    "isFraud": "is_fraud",
    "isFlaggedFraud": "is_flagged_fraud",
}

PAYMENT_TYPES = ["PAYMENT", "TRANSFER", "CASH_OUT", "CASH_IN", "DEBIT"]
# Distribuição aproximada do PaySim.
TYPE_PROBABILITIES = [0.339, 0.083, 0.357, 0.220, 0.001]

# Tipos em que o PaySim registra fraude.
FRAUD_TYPES = ("TRANSFER", "CASH_OUT")

N_PAYSIM_STEPS = 744  # 31 dias, uma transação por hora simulada


# ----------------------------------------------------------------------
# Normalização
# ----------------------------------------------------------------------
def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Renomeia as colunas do PaySim para snake_case e valida o contrato."""
    df = df.rename(columns=COLUMN_MAP).copy()

    if "type" in df.columns:
        df["type"] = df["type"].astype(str).str.upper()

    for column in ("is_fraud", "is_flagged_fraud"):
        if column in df.columns:
            df[column] = df[column].fillna(0).astype(bool)
        else:
            df[column] = False

    for column in (
        "amount",
        "old_balance_org",
        "new_balance_org",
        "old_balance_dest",
        "new_balance_dest",
    ):
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0.0)
        else:
            df[column] = 0.0

    if "step" not in df.columns:
        raise ValueError("Dataset sem a coluna obrigatória 'step'")
    df["step"] = pd.to_numeric(df["step"], errors="coerce").fillna(0).astype(int)

    if "type" not in df.columns:
        raise ValueError("Dataset sem a coluna obrigatória 'type'")

    return df


# ----------------------------------------------------------------------
# Localização do CSV
# ----------------------------------------------------------------------
def resolve_dataset_path(path: Optional[str | Path] = None) -> Optional[Path]:
    """
    Resolve o caminho do PaySim.

    Ordem: argumento explícito → ``DATASET_PATH`` (settings/env) → caminhos
    convencionais do repositório. Retorna ``None`` quando nenhum arquivo existe.
    """
    candidates: list[Path] = []

    if path is not None:
        candidates.append(Path(path))
    else:
        try:
            from db.config import settings

            candidates.append(Path(settings.DATASET_PATH))
        except Exception:  # pragma: no cover - settings sempre importável
            pass

        candidates.extend(
            [
                REPO_DIR / "data" / "paysim.csv",
                REPO_DIR / "data" / "paysim_sample.csv",
                BACKEND_DIR / "data" / "paysim.csv",
                Path.cwd() / "data" / "paysim.csv",
            ]
        )

    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate
        except OSError:  # pragma: no cover - caminho inválido no SO
            continue

    return None


# ----------------------------------------------------------------------
# Gerador sintético (mesmo contrato do PaySim)
# ----------------------------------------------------------------------
def generate_synthetic_paysim(
    n_rows: int = 20_000,
    *,
    fraud_rate: float = 0.005,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Gera transações sintéticas com os padrões do PaySim.

    A taxa de fraude padrão (0,5%) é maior que a do PaySim real (0,13%) para
    dar poder estatístico às janelas dos experimentos. A fraude ocorre apenas
    em ``TRANSFER``/``CASH_OUT`` e é caracterizada pelo esvaziamento da conta de
    origem — o mesmo padrão que o modelo baseline aprende.

    Args:
        n_rows: número de transações.
        fraud_rate: proporção de transações fraudulentas.
        seed: semente para reprodutibilidade.
    """
    if n_rows < 1:
        raise ValueError("n_rows deve ser >= 1")
    if not 0.0 <= fraud_rate < 1.0:
        raise ValueError("fraud_rate deve estar em [0, 1)")

    rng = np.random.default_rng(seed)

    types = rng.choice(PAYMENT_TYPES, size=n_rows, p=TYPE_PROBABILITIES)
    is_fraud = rng.random(n_rows) < fraud_rate
    # No PaySim a fraude só aparece em TRANSFER/CASH_OUT.
    fraud_type = rng.choice(FRAUD_TYPES, size=n_rows)
    types = np.where(is_fraud, fraud_type, types)

    # Valores e saldos (escala log-normal, como no PaySim).
    amount = rng.lognormal(mean=8.8, sigma=1.5, size=n_rows)
    old_balance_org = rng.lognormal(mean=10.2, sigma=1.3, size=n_rows)
    old_balance_dest = rng.lognormal(mean=8.0, sigma=2.0, size=n_rows)

    is_cash_in = types == "CASH_IN"
    is_payment = (types == "PAYMENT") | (types == "DEBIT")

    # CASH_IN: a conta de origem recebe (saldo anterior zero no PaySim).
    old_balance_org = np.where(is_cash_in, 0.0, old_balance_org)
    # Garante saldo suficiente para débitos legítimos.
    old_balance_org = np.where(
        ~is_cash_in & ~is_fraud,
        np.maximum(old_balance_org, amount * rng.uniform(1.0, 4.0, size=n_rows)),
        old_balance_org,
    )

    # --------------------------------------------------------------
    # Saldo de origem
    # --------------------------------------------------------------
    new_balance_org = np.where(
        is_cash_in,
        old_balance_org + amount,
        np.maximum(old_balance_org - amount, 0.0),
    )

    # Fraude: esvaziamento total ou quase total da conta (residual variável).
    # O residual é o que impede uma separação perfeita no dataset sintético e
    # dá espaço para a degradação observada no E2.
    fraud_fraction = rng.uniform(0.68, 1.0, size=n_rows)
    amount = np.where(is_fraud, old_balance_org * fraud_fraction, amount)
    new_balance_org = np.where(
        is_fraud,
        np.maximum(old_balance_org - amount, 0.0),
        new_balance_org,
    )

    # Parte das transações legítimas de TRANSFER/CASH_OUT também esvazia a
    # conta (pagamento de todo o saldo) — falso positivo plausível.
    draining_legit = (
        ~is_fraud
        & np.isin(types, FRAUD_TYPES)
        & (rng.random(n_rows) < 0.015)
    )
    draining_amount = old_balance_org * rng.uniform(0.95, 1.0, size=n_rows)
    amount = np.where(draining_legit, draining_amount, amount)
    new_balance_org = np.where(draining_legit, 0.0, new_balance_org)

    # --------------------------------------------------------------
    # Saldo de destino
    # --------------------------------------------------------------
    # Contas de destino: lojas/agentes sem saldo; recebem o valor.
    old_balance_dest = np.where(is_payment, 0.0, old_balance_dest)

    # Em 20% das fraudes a "mula" já possuía saldo (não é zerada).
    mule_with_balance = is_fraud & (rng.random(n_rows) < 0.20)
    old_balance_dest = np.where(
        is_fraud & ~mule_with_balance, 0.0, old_balance_dest
    )

    new_balance_dest = old_balance_dest + amount
    new_balance_dest = np.where(
        is_fraud & ~mule_with_balance, 0.0, new_balance_dest
    )

    # Sinalizador legado do PaySim (apenas valores acima do limite).
    is_flagged = (amount > 200_000) & is_fraud & (rng.random(n_rows) < 0.2)

    df = pd.DataFrame(
        {
            "step": rng.integers(1, N_PAYSIM_STEPS + 1, size=n_rows),
            "type": types,
            "amount": np.round(amount, 2),
            "name_orig": [f"C{index:09d}" for index in rng.integers(0, 10_000_000, size=n_rows)],
            "old_balance_org": np.round(old_balance_org, 2),
            "new_balance_org": np.round(new_balance_org, 2),
            "name_dest": [f"M{index:09d}" for index in rng.integers(0, 10_000_000, size=n_rows)],
            "old_balance_dest": np.round(old_balance_dest, 2),
            "new_balance_dest": np.round(new_balance_dest, 2),
            "is_fraud": is_fraud,
            "is_flagged_fraud": is_flagged,
        }
    )

    # Ordena por tempo para permitir split temporal coerente.
    df = df.sort_values("step", kind="stable").reset_index(drop=True)
    logger.info(
        "Dataset sintético: %s transações, %s fraudes (%.3f%%)",
        len(df),
        int(df["is_fraud"].sum()),
        100 * df["is_fraud"].mean(),
    )
    return df


# ----------------------------------------------------------------------
# API pública
# ----------------------------------------------------------------------
def load_paysim(
    path: Optional[str | Path] = None,
    *,
    rows: Optional[int] = None,
    sample: Optional[int] = None,
    seed: int = 42,
    allow_synthetic: bool = True,
    fraud_rate: float = 0.005,
) -> pd.DataFrame:
    """
    Carrega o PaySim normalizado.

    Args:
        path: caminho do CSV (default: resolve automaticamente).
        rows: número máximo de linhas lidas do CSV (``nrows``).
        sample: amostra aleatória determinística após a leitura.
        seed: semente da amostragem e do gerador sintético.
        allow_synthetic: gera dados sintéticos quando o CSV não existe.
        fraud_rate: taxa de fraude do gerador sintético.

    Raises:
        FileNotFoundError: quando o CSV não existe e ``allow_synthetic=False``.
    """
    resolved = resolve_dataset_path(path)

    if resolved is None:
        if not allow_synthetic:
            raise FileNotFoundError(
                "PaySim não encontrado. Defina DATASET_PATH ou coloque o CSV em data/paysim.csv"
            )
        logger.warning(
            "PaySim não encontrado — usando gerador sintético determinístico "
            "(rows=%s, fraud_rate=%.4f)",
            rows or 20_000,
            fraud_rate,
        )
        return generate_synthetic_paysim(
            n_rows=rows or 20_000,
            fraud_rate=fraud_rate,
            seed=seed,
        )

    logger.info("Carregando PaySim de %s", resolved)
    df = pd.read_csv(resolved, nrows=rows)
    df = standardize_columns(df)

    if sample is not None and sample < len(df):
        df = df.sample(n=sample, random_state=seed).sort_values(
            "step", kind="stable"
        )

    return df.reset_index(drop=True)


def dataset_info(df: pd.DataFrame) -> dict:
    """Resumo do dataset para relatórios e metadados do modelo."""
    fraud = df["is_fraud"]
    return {
        "rows": int(len(df)),
        "columns": list(df.columns),
        "fraud_count": int(fraud.sum()),
        "fraud_rate": float(fraud.mean()) if len(df) else 0.0,
        "step_min": int(df["step"].min()) if len(df) else 0,
        "step_max": int(df["step"].max()) if len(df) else 0,
        "types": {
            str(name): int(count)
            for name, count in df["type"].value_counts().items()
        },
    }


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera/inspeciona uma amostra do PaySim normalizado."
    )
    parser.add_argument("--rows", type=int, default=20_000)
    parser.add_argument("--fraud-rate", type=float, default=0.005)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--input", type=Path, default=None)
    parser.add_argument(
        "--out",
        type=Path,
        default=REPO_DIR / "data" / "paysim_sample.csv",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    df = load_paysim(
        args.input,
        rows=args.rows,
        seed=args.seed,
        fraud_rate=args.fraud_rate,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)

    info = dataset_info(df)
    print(f"[OK] {info['rows']} transações salvas em {args.out}")
    print(f"     fraudes: {info['fraud_count']} ({info['fraud_rate']:.4%})")
    print(f"     passos: {info['step_min']}..{info['step_max']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
