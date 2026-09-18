"""L'aplatissement silver -> ligne plate vit dans src/core/, pas dans le pipeline.

Le service d'ingestion tourne avec une image qui ne copie que src/core/ : un
aplatissement resté dans src/01_data_engineering/ serait introuvable en production.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))

import game_rows  # noqa: E402


def _record() -> dict:
    return {
        "match_id": "EUW1_1", "puuid": "P", "champion": "Ahri", "win": True,
        "patch": "16.13", "game_ts": 1757000000000, "role": "MIDDLE",
        "lane": {"csm10": 7.5, "gd10": 120},
        "deaths": [{"phase": "early", "is_solo": True, "gold_state": "behind"}],
        "kills": [], "assists": [],
        "position": {"frac_enemy_half": 0.31, "avg_map_depth": 4200},
    }


def test_le_record_silver_imbrique_devient_une_ligne_plate():
    row = game_rows.game_to_row(_record())
    assert row["csm10"] == 7.5
    assert row["pos_frac_enemy_half"] == 0.31
    assert row["n_deaths"] == 1
    assert row["deaths_early"] == 1


def test_les_colonnes_meta_sont_optionnelles():
    row = game_rows.game_to_row(_record())
    assert row["rank"] is None
    assert row["source"] == "inference"


def test_core_ne_depend_plus_du_pipeline_pour_aplatir():
    import ml_rank
    assert ml_rank.game_rows is game_rows
    assert not hasattr(ml_rank, "build_dataset")
