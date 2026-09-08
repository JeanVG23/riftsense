"""Parité de la liste des plateformes entre le formulaire et le routeur Riot.

Une plateforme proposée au visiteur mais absente de PLATFORM_TO_REGIONAL donne
une erreur `internal` une minute après l'inscription, au lieu d'un refus immédiat.
"""
from __future__ import annotations

import re
from pathlib import Path

import riotlib as rl

REGISTER_TS = Path(__file__).resolve().parents[1] / "web" / "cf" / "src" / "register.ts"


def _ts_platforms() -> set[str]:
    src = REGISTER_TS.read_text()
    block = src[src.index("export const PLATFORMS = ["):]
    block = block[:block.index("] as const;")]
    return set(re.findall(r'"([a-z0-9]+)"', block))


def test_platforms_match():
    assert _ts_platforms() == set(rl.PLATFORM_TO_REGIONAL)
