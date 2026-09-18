"""src/core/game_rows.py : aplatit un record silver imbriqué en ligne plate.

Le silver est imbriqué (lane.csm10, position.frac_*, listes de kills/deaths) et les
modèles attendent des colonnes plates. Ce module est le chemin UNIQUE de cette
conversion, partagé par la construction des datasets et par l'inférence.

Il vit dans src/core/ et non dans src/01_data_engineering/ parce que le service
d'ingestion tourne avec une image qui ne copie que src/core/ : un aplatissement resté
dans le pipeline serait introuvable en production, et l'appeler quand même produirait
des features silencieusement NaN plutôt qu'une erreur.
"""
from __future__ import annotations

import collections

import numpy as np

import role_features as rf


def game_to_row(g: dict, rank: str | None = None, source: str = "inference") -> dict:
    lane = g.get("lane", {})
    deaths = g.get("deaths", [])
    kills = g.get("kills", [])
    assists = g.get("assists", [])
    jungle = g.get("jungle") or {}
    n = len(deaths)
    ph = collections.Counter(d["phase"] for d in deaths)
    gs = collections.Counter(d.get("gold_state") for d in deaths if d.get("gold_state"))
    gs_tot = sum(gs.values())
    return {
        # méta (non-features)
        "match_id": g["match_id"], "puuid": g.get("puuid"), "source": source,
        "rank": rank, "champion": g["champion"], "win": int(g["win"]),
        "patch": g.get("patch"), "game_ts": g.get("game_ts"),
        # features de lane (diffs vs adversaire)
        "gd10": lane.get("gd10"), "gd14": lane.get("gd14"), "gd20": lane.get("gd20"),
        "csd10": lane.get("csd10"), "csd14": lane.get("csd14"), "xpd10": lane.get("xpd10"),
        "csm10": lane.get("csm10"), "csm14": lane.get("csm14"),
        "gpm10": lane.get("gpm10"), "gpm14": lane.get("gpm14"),
        "xppm10": lane.get("xppm10"),
        # features de morts
        "n_deaths": n,
        "deaths_early": ph.get("early", 0),
        "deaths_mid": ph.get("mid", 0),
        "deaths_late": ph.get("late", 0),
        "deaths_solo": sum(1 for d in deaths if d.get("is_solo")),
        "deaths_teamfight": sum(1 for d in deaths if not d.get("is_solo")),
        "deaths_early_jungle": sum(1 for d in deaths if d.get("phase") == "early" and d.get("is_ganked_by_jungle")),
        "deaths_early_2v2": sum(1 for d in deaths if d.get("phase") == "early" and d.get("is_2v2")),
        "kills_solo": sum(1 for k in kills if k.get("is_solo")),
        "kills_2v2": sum(1 for k in kills if k.get("is_2v2")),
        "assists_2v2": sum(1 for a in assists if a.get("is_2v2")),
        "kda_1v1": sum(1 for k in kills if k.get("is_solo")) / max(1, sum(1 for d in deaths if d.get("is_solo"))),
        "kda_2v2": (sum(1 for k in kills if k.get("is_2v2")) + sum(1 for a in assists if a.get("is_2v2"))) / max(1, sum(1 for d in deaths if d.get("is_2v2"))),
        "frac_behind": gs.get("behind", 0) / gs_tot if gs_tot else np.nan,
        "frac_ahead": gs.get("ahead", 0) / gs_tot if gs_tot else np.nan,
        # macro
        "avg_dragon_prox": g.get("avg_dragon_prox") if g.get("avg_dragon_prox") is not None else np.nan,
        "support_deaths_early": g.get("support_deaths_early", 0),
        "plates_diff_early": g.get("plates_diff_early", 0),
        "frames_in_base_early": g.get("frames_in_base_early", 0),
        # Features propres au jungler. Elles restent manquantes pour les autres
        # roles et ne figurent que dans le manifeste JUNGLE.
        **{feature: jungle.get(feature, np.nan)
           for feature in rf.JUNGLE_DESCRIPTIVE},
        **{f"pos_{k}": v for k, v in (g.get("position") or {}).items()},
    }
