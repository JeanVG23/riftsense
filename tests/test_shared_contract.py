"""Contrat des artefacts partagés entre la CLI Python et le Worker.

Les empreintes de prompt ne sont pas que de la télémétrie : `coaching_context.ts`
classe une review `ready` ou `stale` en comparant `run.prompt_version` à la version
courante. Un hash qui bouge périme toutes les reviews déjà publiées, coûte des appels
Ollama et casse la comparaison de cohortes en cours. Ces valeurs sont donc figées ici :
les faire évoluer est une décision, jamais un effet de bord d'un déplacement de texte.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "04_coaching"))

import prompt as PR  # noqa: E402


def test_prompt_versions_are_frozen():
    assert PR.PROMPT_VERSION == "ba5a8458369c"
    assert PR.GAME_PROMPT_VERSION == "350f7c404b5b"
    assert PR.SPECIALIZED_PROMPT_VERSION == "942a61913afa"
