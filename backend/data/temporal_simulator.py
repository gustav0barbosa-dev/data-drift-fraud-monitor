"""
Simulador de passagem do tempo (T1.4).

Divide o dataset em janelas temporais contíguas (o "fluxo" de transações visto
pela fintech) e permite aplicar um cenário de drift a cada janela. É a base dos
experimentos E1, E2 e E4 e do simulador exibido no dashboard.

Uso::

    from data.loader import load_paysim
    from data.temporal_simulator import TemporalSimulator

    df = load_paysim(rows=20_000)
    simulator = TemporalSimulator(df, n_windows=12)
    windows = simulator.generate(level="high", ramp=True)
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Optional, Sequence

import pandas as pd

from data.drift_simulator import DriftLevel, DriftSimulator, DRIFT_LEVELS
from data.loader import standardize_columns


@dataclass(frozen=True)
class TemporalWindow:
    """Uma janela temporal do fluxo de transações."""

    index: int
    label: str
    frame: pd.DataFrame
    start_step: int
    end_step: int
    drift_level: DriftLevel = "none"
    drift_intensity: float = 0.0

    @property
    def rows(self) -> int:
        return len(self.frame)

    @property
    def fraud_rate(self) -> float:
        if "is_fraud" not in self.frame.columns or self.rows == 0:
            return 0.0
        return float(self.frame["is_fraud"].mean())

    def summary(self) -> dict:
        return {
            "index": self.index,
            "label": self.label,
            "start_step": self.start_step,
            "end_step": self.end_step,
            "rows": self.rows,
            "fraud_rate": round(self.fraud_rate, 6),
            "drift_level": self.drift_level,
            "drift_intensity": round(self.drift_intensity, 4),
        }


class TemporalSimulator:
    """
    Gera janelas temporais a partir de um dataset de transações.

    Args:
        df: transações (PaySim normalizado).
        n_windows: número de janelas desejadas.
        window_size: tamanho máximo de cada janela em linhas. Quando informado,
            prevalece sobre ``n_windows`` (limitado ao total de linhas).
        seed: semente usada pelo simulador de drift.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        *,
        n_windows: int = 12,
        window_size: Optional[int] = None,
        seed: int = 42,
    ) -> None:
        if n_windows < 1:
            raise ValueError("n_windows deve ser >= 1")

        self.frame = standardize_columns(df).sort_values(
            "step", kind="stable"
        ).reset_index(drop=True)
        self.n_windows = n_windows
        self.window_size = window_size
        self.seed = seed

    # ------------------------------------------------------------------
    # Janelas
    # ------------------------------------------------------------------
    def windows(self) -> list[TemporalWindow]:
        """Divide o fluxo em janelas temporais contíguas (sem drift)."""
        total = len(self.frame)
        if total == 0:
            raise ValueError("Dataset vazio")

        if self.window_size is not None:
            if self.window_size < 1:
                raise ValueError("window_size deve ser >= 1")
            n_windows = max(1, min(total // self.window_size, self.n_windows))
            chunks = [
                self.frame.iloc[index * self.window_size : (index + 1) * self.window_size]
                for index in range(n_windows)
            ]
        else:
            n_windows = min(self.n_windows, total)
            boundaries = [
                round(index * total / n_windows) for index in range(n_windows + 1)
            ]
            chunks = [
                self.frame.iloc[boundaries[index] : boundaries[index + 1]]
                for index in range(n_windows)
            ]

        return [
            TemporalWindow(
                index=index,
                label=f"W{index + 1:02d}",
                frame=chunk.reset_index(drop=True),
                start_step=int(chunk["step"].min()),
                end_step=int(chunk["step"].max()),
            )
            for index, chunk in enumerate(chunks)
            if len(chunk) > 0
        ]

    def generate(
        self,
        *,
        level: DriftLevel = "none",
        ramp: bool = False,
        ramp_windows: int = 5,
    ) -> list[TemporalWindow]:
        """
        Gera as janelas aplicando o cenário de drift.

        Com ``ramp=True`` a intensidade cresce linearmente até a intensidade
        máxima do nível em ``ramp_windows`` janelas — o mesmo desenho usado para
        medir latência de detecção.
        """
        if level not in DRIFT_LEVELS:
            raise ValueError(
                f"Nível inválido: {level}. Use um de {sorted(DRIFT_LEVELS)}"
            )
        if ramp_windows < 1:
            raise ValueError("ramp_windows deve ser >= 1")

        base_intensity = DRIFT_LEVELS[level]["intensity"]
        windows = self.windows()
        simulator = DriftSimulator(seed=self.seed)

        drifted: list[TemporalWindow] = []
        for window in windows:
            if ramp:
                progress = min(1.0, (window.index + 1) / ramp_windows)
                intensity = base_intensity * progress
            else:
                intensity = base_intensity

            frame = simulator.apply(window.frame, intensity=intensity)
            drifted.append(
                replace(
                    window,
                    frame=frame,
                    drift_level=level if intensity > 0 else "none",
                    drift_intensity=intensity,
                )
            )

        return drifted

    def reference(self, ratio: float = 0.5) -> pd.DataFrame:
        """Retorna a primeira fração do fluxo, usada como referência."""
        if not 0.0 < ratio <= 1.0:
            raise ValueError("ratio deve estar em (0, 1]")
        rows = max(1, int(len(self.frame) * ratio))
        return self.frame.iloc[:rows].reset_index(drop=True)


def simulate_passage_of_time(
    df: pd.DataFrame,
    *,
    n_windows: int = 12,
    window_size: Optional[int] = None,
    seed: int = 42,
) -> list[TemporalWindow]:
    """Atalho para criar o simulador e obter as janelas sem drift."""
    return TemporalSimulator(
        df,
        n_windows=n_windows,
        window_size=window_size,
        seed=seed,
    ).windows()


def drifted_stream(
    df: pd.DataFrame,
    *,
    level: DriftLevel = "none",
    n_windows: int = 12,
    window_size: Optional[int] = None,
    ramp: bool = False,
    ramp_windows: int = 5,
    seed: int = 42,
) -> list[TemporalWindow]:
    """Atalho para obter o fluxo já com o cenário de drift aplicado."""
    return TemporalSimulator(
        df,
        n_windows=n_windows,
        window_size=window_size,
        seed=seed,
    ).generate(level=level, ramp=ramp, ramp_windows=ramp_windows)


def windows_frame(windows: Sequence[TemporalWindow]) -> pd.DataFrame:
    """Concatena as janelas em um único DataFrame (com a coluna ``window``)."""
    frames = []
    for window in windows:
        frame = window.frame.copy()
        frame["window"] = window.label
        frames.append(frame)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
