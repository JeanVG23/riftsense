"""Ce que l'image doit contenir, vérifié sur les fichiers de build.

Sans ce test, une exclusion de .dockerignore ferait échouer un COPY en production et
non ici. Le service ne peut pas scorer un visiteur avec un export qui n'est pas dans
l'image, et l'absence ne se verrait qu'au premier `model_missing` massif.

Le test ne lit pas les lignes du fichier, il les APPLIQUE : vérifier que `*.pkl` y
figure ne prouve rien, parce que .dockerignore n'est pas .gitignore. Un motif sans
barre oblique n'y vaut qu'à la racine du contexte. Mesuré sur un vrai build le
2026-09-18 : avec `!data/05_model` seul, les 46 Mo de pickles entraient dans l'image
malgré la présence de `*.pkl`.
"""
from __future__ import annotations

import fnmatch
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _regex(pattern: str) -> re.Pattern:
    """Traduit un motif Docker : `*` ne traverse pas les barres obliques, `**` si.

    La barre oblique finale est retirée comme le fait `filepath.Clean` : `tests/`
    et `tests` désignent la même entrée.
    """
    pattern = pattern.rstrip("/") or "/"
    out, i = [], 0
    while i < len(pattern):
        char = pattern[i]
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif char == "*":
            out.append("[^/]*")
            i += 1
        elif char == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(char))
            i += 1
    return re.compile("^" + "".join(out).replace(".*/", "(?:.*/)?") + "$")


def _exclu(chemin: str, motifs: list[str]) -> bool:
    """Reproduit `MatchesOrParentMatches` : le DERNIER motif qui touche décide.

    Un motif touche le chemin ou l'un de ses ancêtres : c'est ce qui fait qu'un
    dossier exclu emporte son contenu, et qu'une réinclusion du dossier le rend.
    """
    ancetres = [chemin]
    parent = Path(chemin).parent
    while str(parent) != ".":
        ancetres.append(str(parent))
        parent = parent.parent
    exclu = False
    for motif in motifs:
        negatif = motif.startswith("!")
        regex = _regex(motif.lstrip("!"))
        if any(regex.match(candidat) for candidat in ancetres):
            exclu = not negatif
    return exclu


@pytest.fixture(scope="module")
def motifs() -> list[str]:
    lignes = (ROOT / ".dockerignore").read_text().splitlines()
    return [ligne.strip() for ligne in lignes
            if ligne.strip() and not ligne.strip().startswith("#")]


@pytest.mark.parametrize("chemin", [
    "data/05_model/top_ebm_export.json",
    "data/05_model/support_ebm_export.json",
    "data/05_model/role_readiness.json",
    "data/00_static/champion_traits.json",
    "src/core/ebm_lookup.py",
    "service/role_scoring.py",
])
def test_ce_que_l_image_doit_recevoir(motifs, chemin):
    assert not _exclu(chemin, motifs), f"{chemin} n'entrerait pas dans l'image"


@pytest.mark.parametrize("chemin", [
    # Réinclure data/05_model sans exclure son contenu y faisait entrer ceci.
    "data/05_model/top_player_ebm.pkl",
    "data/05_model/ebm_player_highelo.pkl",
    "data/05_model/sequence_supervised.pt",
    "data/05_model/player_train_oof.json",
    "data/04_dataset/top_player_dataset.parquet",
    "data/01_raw/EUW1_1_match.json.zst",
    "tests/test_service_packaging.py",
    "web/cf/src/index.ts",
])
def test_ce_que_l_image_ne_doit_pas_recevoir(motifs, chemin):
    assert _exclu(chemin, motifs), f"{chemin} entrerait dans l'image"


def test_le_modele_de_motifs_reproduit_le_piege_mesure():
    """Garde-fou du garde-fou : sans `data/05_model/*`, le pickle passe.

    Si cette assertion tombe, le modèle ci-dessus a cessé de reproduire Docker et
    les deux tests précédents ne prouvent plus rien.
    """
    sans_exclusion = ["data/*", "!data/05_model",
                      "!data/05_model/*_ebm_export.json", "*.pkl"]
    assert not _exclu("data/05_model/top_player_ebm.pkl", sans_exclusion)


def test_le_dockerfile_copie_les_artefacts_et_tient_le_budget():
    texte = (ROOT / "Dockerfile").read_text()
    assert "data/05_model/" in texte
    assert "--timeout 600" in texte
    assert "--timeout 300" not in texte, (
        "un commentaire ou un flag qui décrit l'ancien dimensionnement est pire qu'absent"
    )


def test_le_service_declare_numpy_et_pandas():
    requirements = (ROOT / "service" / "requirements.txt").read_text()
    assert "numpy" in requirements and "pandas" in requirements
    assert "interpret" not in requirements, (
        "l'export existe précisément pour garder la pile ML hors du conteneur"
    )


def test_fnmatch_n_est_pas_la_semantique_docker():
    """Pourquoi ce module traduit les motifs au lieu d'appeler fnmatch."""
    assert fnmatch.fnmatch("data/05_model/x.pkl", "*.pkl")
    assert not _exclu("data/05_model/x.pkl", ["*.pkl"])
