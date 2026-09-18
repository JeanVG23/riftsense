"""Le Makefile declare le pipeline : on verifie que ce qu'il declare existe.

Un orchestrateur qui reference un script renomme echoue en production, au pire
moment (apres une collecte de plusieurs heures). Ces tests sont l'equivalent
d'un `--dry-run` de DAG : ils ne calculent rien, ils verifient que le graphe
tient debout et que l'ordre topologique est celui du pipeline medallion.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MAKEFILE = ROOT / "Makefile"
pytestmark = pytest.mark.skipif(shutil.which("make") is None, reason="make absent")


def _plan(tmp_path) -> list[str]:
    """Commandes que make lancerait pour `pipeline`, sur une racine de donnees
    vide : rien n'existe, donc tout le graphe se deroule."""
    out = subprocess.run(["make", "-n", "pipeline", f"DATA={tmp_path}"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return [ln.strip() for ln in out.stdout.splitlines() if "src/" in ln]


def test_every_script_referenced_by_the_makefile_exists():
    """Y compris les cibles reseau, que les tests ne lancent jamais : c'est
    justement celles-la qu'un renommage casserait en silence."""
    paths = set(re.findall(r"src/[\w./]+\.py", MAKEFILE.read_text()))
    assert paths, "aucun script reference : le Makefile a-t-il change de forme ?"
    missing = sorted(p for p in paths if not (ROOT / p).exists())
    assert not missing, f"scripts references mais absents : {missing}"


def test_the_plan_follows_the_medallion_order(tmp_path):
    plan = "\n".join(_plan(tmp_path))
    order = ["reextract_silver", "build_dataset", "build_player_dataset",
             "build_split", "train_player_ensemble", "calibrate_player_rank",
             "train_player_lp", "rebuild_gold",
             "shap_analysis.py --level player", "train_ensemble.py",
             "shap_analysis.py --level game"]
    positions = [plan.find(step) for step in order]
    assert all(p >= 0 for p in positions), dict(zip(order, positions))
    assert positions == sorted(positions), f"ordre casse : {dict(zip(order, positions))}"


def test_the_offline_pipeline_never_calls_the_api_nor_publishes(tmp_path):
    """`make pipeline` doit rester hors-ligne : la collecte Riot et la
    publication Cloudflare sont des cibles explicites, jamais des dependances.
    Sans ce test, ajouter un `fetch_apex_lp` en prerequis passerait inapercu
    jusqu'a la premiere facture de quota."""
    forbidden = ("build_referential", "fetch_apex_lp", "densify_",
                 "sync_cloudflare", "aggregate_games", "fetch_ladder",
                 "backfill_summoner_profiles")
    plan = "\n".join(_plan(tmp_path))
    assert not [name for name in forbidden if name in plan], plan


def test_la_chaine_par_role_est_dans_le_graphe(tmp_path):
    """Sans ce cablage, rien ne perimait les artefacts par role.

    Toucher `role_features.py` ou `positioning.py` change les colonnes agregees
    des cinq datasets et des cinq modeles, mais `make plan` n'en savait rien : la
    chaine se relancait de tete, donc en pratique jamais, et on aurait fini par
    lire une table d'ouverture calculee sur des features disparues.
    """
    plan = "\n".join(_plan(tmp_path))
    for step in ("build_dataset.py --role", "build_role_player_dataset.py --role",
                 "train_role_ensemble.py --role", "role_readiness.py"):
        assert step in plan, plan


def test_les_cinq_roles_traversent_le_graphe(tmp_path):
    """Un role oublie ne se voit pas : sa table reste servie, simplement vieille."""
    plan = "\n".join(_plan(tmp_path))
    for role in ("top", "jungle", "middle", "bottom", "support"):
        assert f"train_role_ensemble.py --role {role}" in plan, role


def test_l_ordre_par_role_va_des_games_aux_fenetres_puis_au_modele(tmp_path):
    plan = "\n".join(_plan(tmp_path))
    order = ["build_dataset.py --role jungle",
             "build_role_player_dataset.py --role jungle",
             "train_role_ensemble.py --role jungle",
             "role_readiness.py"]
    positions = [plan.find(step) for step in order]
    assert all(p >= 0 for p in positions), dict(zip(order, positions))
    assert positions == sorted(positions), dict(zip(order, positions))


def test_un_snapshot_de_ladder_absent_renvoie_vers_make_ladder(tmp_path):
    """Le label de rang vient d'un appel API date : il n'a pas sa place dans une
    chaine hors-ligne. Absent, make doit nommer la commande a lancer plutot que
    repondre « No rule to make target », qui n'apprend rien a personne.
    """
    out = subprocess.run(["make", "-n", "roles", f"DATA={tmp_path}"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    assert "make ladder" in out.stdout


def _var(name: str, data: Path) -> str:
    out = subprocess.run(["make", "-s", f"print-{name}", f"DATA={data}"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return out.stdout.strip()


def test_le_chemin_du_ladder_porte_la_plateforme(tmp_path):
    """Une variable vide ne se voit pas : elle fabrique un chemin plausible.

    `PLATFORM` derive de `REGION` ; definie avant elle, elle s'expansait en vide
    et le snapshot se cherchait dans `rank_snapshots//`, donc jamais trouve. Le
    graphe restait vert, et chaque build partait chercher un fichier introuvable.
    """
    assert "/rank_snapshots/euw1/" in _var("LADDER", tmp_path)


def test_le_jour_retenu_est_le_dernier_snapshot_complet(tmp_path):
    """Un jour present sur disque mais non marque complet est une pagination
    interrompue : le prendre pour label labelliserait le corpus sur un ladder
    ampute de quelques centaines de joueurs, sans que rien ne le signale.
    """
    folder = tmp_path / "01_raw" / "rank_snapshots" / "euw1"
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(json.dumps({
        "2026-09-10": {"complete": True, "n_rows": 10},
        "2026-09-17": {"complete": True, "n_rows": 10},
        "2026-09-18": {"complete": False}}))
    assert _var("SNAPSHOT_DAY", tmp_path) == "2026-09-17"
