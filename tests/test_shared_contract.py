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

sys.path.insert(0, str(ROOT / "src" / "pipeline_ops"))

import generate_shared  # noqa: E402


def test_prompt_versions_are_frozen():
    assert PR.PROMPT_VERSION == "280fff44c0f2"
    assert PR.GAME_PROMPT_VERSION == "07692894c681"
    assert PR.SPECIALIZED_PROMPT_VERSION == "2eb635e93251"


def test_generated_files_match_the_generator():
    """Le fichier généré sur disque doit être celui que le générateur produit.

    Ce test EST le mécanisme de parité entre les deux runtimes : un prompt modifié
    sans régénération échoue ici, et une édition à la main de generated/shared.ts
    aussi. Il remplace l'ancien test qui reconstruisait le littéral TS par
    découpage de chaîne, lequel devenait vert dès qu'on reformatait le fichier.
    """
    missing, stale = [], []
    for path, expected in generate_shared.build().items():
        if not path.exists():
            missing.append(path)
        elif path.read_text(encoding="utf-8") != expected:
            stale.append(path)
    assert not missing and not stale, (
        f"manquants={missing} perimes={stale} : lancer `make generate-shared`")


def test_generation_is_idempotent():
    assert generate_shared.build() == generate_shared.build()
