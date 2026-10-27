"""
Simulador de cenários de Data Drift (T1.5).

O simulador aplica dois componentes, como na literatura de drift:

1. **Covariate shift** — muda a distribuição das features (valores e saldos
   crescem, mix de tipos de transação muda).
2. **Concept drift** — muda a relação entre features e rótulo: surge uma nova
   tipologia de fraude (valores altos sem esvaziar a conta) e parte do padrão
   antigo deixa de ser fraude (fraudadores se adaptam).

Os níveis seguem o PDF (``none``, ``low``, ``moderate``, ``high``) e as
intensidades são as mesmas usadas no E3, o que permite comparar a degradação do
modelo (E2) com a sensibilidade dos detectores.

Uso::

    from data.loader import load_paysim
    from data.drift_simulator import apply_drift

    df = load_paysim(rows=20_000)
    drifted = apply_drift(df, "high", seed=42)
"""
from __future__ import annotations

from typing import Literal, Optional

import numpy as np
import pandas as pd

from data.loader import standardize_columns

DriftLevel = Literal["none", "low", "moderate", "high"]

# Intensidade relativa de cada cenário (0 = controle).
DRIFT_LEVELS: dict[str, dict] = {
    "none": {
        "intensity": 0.0,
        "label": "Sem drift",
        "description": "Controle: mesma distribuição da referência.",
    },
    "low": {
        "intensity": 0.35,
        "label": "Drift baixo",
        "description": "Deslocamento leve de valores/saldos e 2% de nova tipologia.",
    },
    "moderate": {
        "intensity": 0.70,
        "label": "Drift moderado",
        "description": "Valores ~60% maiores, mix de tipos alterado e 5% de nova tipologia.",
    },
    "high": {
        "intensity": 1.20,
        "label": "Drift forte",
        "description": "Valores ~2x, mix de tipos alterado e 10% de nova tipologia.",
    },
}

# Fração de transações elegíveis convertidas para a nova tipologia de fraude.
NEW_TYPOLOGY_RATE = 0.08
# Fração de fraudes do padrão antigo que deixam de ser fraude.
ADAPTED_FRAUD_RATE = 0.06


class DriftSimulator:
    """
    Aplica drift a um DataFrame de transações.

    Args:
        seed: semente da componente aleatória (jitter, remapeamento de tipos e
            das novas tipologias de fraude).
    """

    def __init__(self, seed: int = 42) -> None:
        self.seed = seed
        self._counter = 0

    def apply(
        self,
        df: pd.DataFrame,
        *,
        level: DriftLevel = "none",
        intensity: Optional[float] = None,
    ) -> pd.DataFrame:
        """
        Retorna uma cópia do DataFrame com o drift aplicado.

        ``intensity`` sobrepõe o valor do nível (usado no ramp do E4).
        """
        if level not in DRIFT_LEVELS:
            raise ValueError(
                f"Nível inválido: {level}. Use um de {sorted(DRIFT_LEVELS)}"
            )

        if intensity is None:
            intensity = DRIFT_LEVELS[level]["intensity"]
        intensity = float(max(0.0, intensity))

        frame = standardize_columns(df)
        if intensity == 0.0 or frame.empty:
            return frame

        self._counter += 1
        rng = np.random.default_rng(self.seed + self._counter)

        frame = frame.copy()
        n = len(frame)
        types = frame["type"].to_numpy(dtype=object)
        is_fraud = frame["is_fraud"].to_numpy(dtype=bool)

        # ----------------------------------------------------------
        # 1. Covariate shift — valores e saldos
        # ----------------------------------------------------------
        amount = frame["amount"].to_numpy(dtype=float)
        old_org = frame["old_balance_org"].to_numpy(dtype=float)
        old_dest = frame["old_balance_dest"].to_numpy(dtype=float)

        amount_scale = 1.0 + 0.85 * intensity
        jitter = rng.lognormal(
            mean=0.0, sigma=0.05 + 0.20 * intensity, size=n
        )

        amount = amount * amount_scale * jitter
        old_org = old_org * (1.0 + 0.45 * intensity)
        old_dest = old_dest * (1.0 + 0.35 * intensity)

        is_cash_in = types == "CASH_IN"
        original_fraud = is_fraud.copy()

        # ----------------------------------------------------------
        # 2. Mix de tipos — canais mais usados durante o drift
        # ----------------------------------------------------------
        switch_rate = min(1.0, 0.25 * intensity)
        switchable = np.isin(types, ["PAYMENT", "CASH_IN"])
        switch = switchable & (rng.random(n) < switch_rate)
        if switch.any():
            types = np.where(
                switch,
                rng.choice(["TRANSFER", "CASH_OUT"], size=n),
                types,
            )

        # ----------------------------------------------------------
        # 3. Concept drift — nova tipologia e fraudes adaptadas
        # ----------------------------------------------------------
        # A nova tipologia de fraude NÃO esvazia a conta: são transferências de
        # valor alto que preservam saldo — exatamente o padrão que o modelo
        # baseline não aprendeu.
        eligible = np.isin(types, ["TRANSFER", "CASH_OUT"]) & ~original_fraud
        reference = amount[eligible]
        high_value = amount > np.median(reference) if reference.size else np.zeros(n, dtype=bool)
        new_typology = (
            eligible
            & high_value
            & (rng.random(n) < NEW_TYPOLOGY_RATE * intensity)
        )

        # Parte das fraudes antigas deixa de existir (fraudadores se adaptam).
        adapted = original_fraud & (
            rng.random(n) < ADAPTED_FRAUD_RATE * intensity
        )

        # Valores: a fraude antiga continua esvaziando; a nova tipologia e as
        # fraudes adaptadas ficam com valores parcialmente drenados.
        fraud_amount = old_org * rng.uniform(0.90, 1.0, size=n)
        new_typology_amount = old_org * rng.uniform(0.25, 0.70, size=n)
        adapted_amount = np.minimum(
            amount, old_org * rng.uniform(0.20, 0.60, size=n)
        )

        amount = np.where(new_typology, new_typology_amount, amount)
        amount = np.where(original_fraud & ~adapted, fraud_amount, amount)
        amount = np.where(adapted, adapted_amount, amount)

        new_org = np.where(
            is_cash_in,
            old_org + amount,
            np.maximum(old_org - amount, 0.0),
        )
        new_dest = old_dest + amount

        # Fraudes do padrão antigo: conta de origem zerada e, na maioria dos
        # casos, destino "mula" também zerado.
        mule_zero = original_fraud & ~adapted & (rng.random(n) >= 0.20)
        new_org = np.where(original_fraud & ~adapted, 0.0, new_org)
        new_dest = np.where(mule_zero, 0.0, new_dest)

        # A nova tipologia usa contas de destino recém-criadas (saldo inicial
        # zero) que recebem o valor, mas preserva saldo na origem. O baseline,
        # treinado com fraudes que esvaziam a origem e zeram o destino, não
        # aprendeu essa combinação; um modelo retreinado consegue aprendê-la.
        old_dest = np.where(new_typology, 0.0, old_dest)
        new_dest = np.where(new_typology, amount, new_dest)

        is_fraud = (original_fraud | new_typology) & ~adapted

        frame["type"] = types
        frame["amount"] = np.round(amount, 2)
        frame["old_balance_org"] = np.round(old_org, 2)
        frame["new_balance_org"] = np.round(new_org, 2)
        frame["old_balance_dest"] = np.round(old_dest, 2)
        frame["new_balance_dest"] = np.round(new_dest, 2)
        frame["is_fraud"] = is_fraud
        frame["is_flagged_fraud"] = False

        return frame


def apply_drift(
    df: pd.DataFrame,
    level: DriftLevel = "high",
    *,
    intensity: Optional[float] = None,
    seed: int = 42,
) -> pd.DataFrame:
    """Atalho para aplicar um cenário de drift a um DataFrame."""
    return DriftSimulator(seed=seed).apply(df, level=level, intensity=intensity)


def drift_level_info(level: DriftLevel) -> dict:
    """Metadados do cenário (intensidade, rótulo e descrição)."""
    if level not in DRIFT_LEVELS:
        raise ValueError(f"Nível inválido: {level}")
    return {"level": level, **DRIFT_LEVELS[level]}


def level_summary(level: DriftLevel, *, seed: int = 42, rows: int = 2_000) -> dict:
    """
    Resumo descritivo de um cenário (útil para relatórios e testes).

    Gera uma amostra sintética, aplica o drift e devolve médias das principais
    features, taxa de fraude e a proporção de cada tipo de transação.
    """
    from data.loader import generate_synthetic_paysim

    base = generate_synthetic_paysim(rows, seed=seed)
    drifted = apply_drift(base, level, seed=seed)

    return {
        "level": level,
        "intensity": DRIFT_LEVELS[level]["intensity"],
        "base_mean_amount": float(base["amount"].mean()),
        "drifted_mean_amount": float(drifted["amount"].mean()),
        "base_fraud_rate": float(base["is_fraud"].mean()),
        "drifted_fraud_rate": float(drifted["is_fraud"].mean()),
        "base_types": base["type"].value_counts(normalize=True).round(4).to_dict(),
        "drifted_types": drifted["type"].value_counts(normalize=True).round(4).to_dict(),
    }
