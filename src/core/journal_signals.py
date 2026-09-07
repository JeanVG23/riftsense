"""Dérivations du journal par-game : recalls jugés, tracking, contexte allié.

Module PUR, 0 I/O, 0 API. `game_journal.py` reste l'assembleur : il appelle ces
fonctions et ne porte aucune logique neuve. La dépendance ne va que dans ce
sens, d'où le duck-typing sur l'index `_Timeline` (l'importer serait circulaire).

ASYMÉTRIE (non négociable). Tout ce qui sort d'ici est une information que le
joueur AVAIT : le kill feed, les annonces d'objectif et de tourelle, le
scoreboard (donc les objets adverses), sa propre position, celle de son allié
affichée sur la minimap. Jamais un `WARD_KILL` adverse, jamais une position
ennemie hors événement public, jamais un proxy `ML_ONLY` de `positioning.py`.

PRÉCISION. Les frames de la timeline sont espacées de 60 s : aucun CS n'est
mesurable au minion près. `PRECISION_CS` est le plancher de granularité, et
chaque estimation le transporte pour que le prompt cite « environ 6 CS, à 2
près » plutôt qu'un chiffre nu.
"""
from __future__ import annotations

import statistics

from riotlib import clock_of, cs_of

PRECISION_CS = 2          # plancher impose par des frames a 60 s
CS_WINDOW_MIN = 2         # fenetre de mesure d'un recall : 120 s


def cs_baseline(my_frames: dict[int, dict], skip: set[int]) -> float | None:
    """Médiane des deltas de CS par minute, minutes contaminées exclues.

    `skip` = minutes portant un recall ou une mort. Sans cette exclusion, la
    ligne de base intègre les événements mêmes qu'on mesure et sous-estime la
    perte. Un delta est écarté dès que l'une de ses deux bornes est contaminée :
    l'intervalle est à cheval sur l'événement, et exclure une minute de trop
    vaut mieux que laisser fuir un reset dans la référence.
    """
    deltas = []
    for minute in sorted(my_frames):
        previous = my_frames.get(minute - 1)
        if previous is None or minute in skip or (minute - 1) in skip:
            continue
        deltas.append(cs_of(my_frames[minute]) - cs_of(previous))
    return statistics.median(deltas) if deltas else None


def recall_cs_cost(my_frames: dict[int, dict], opp_frames: dict[int, dict],
                   t0: int, baseline: float | None) -> dict | None:
    """Coût en CS d'une visite de shop, sur les 120 s de la fenêtre de mesure.

    La fenêtre part de la frame À OU AVANT la visite (`t0 // 60000`), elle
    inclut donc jusqu'à ~60 s de lane AVANT le recall, et le CS pris pendant ce
    temps dilue la perte estimée. C'est délibéré : sous-estimer vaut mieux
    qu'accuser à tort, et démarrer à la frame suivante surestimerait le CS qu'il
    était mécaniquement impossible de prendre.

    Bloc omis si la ligne de base manque, si moins de deux frames complètes
    suivent la visite (fin de partie), ou si l'adversaire de lane n'est pas
    résolu : mieux vaut ne rien dire que mesurer sur une moitié de fenêtre.
    """
    if baseline is None:
        return None
    start = t0 // 60000
    end = start + CS_WINDOW_MIN
    if any(minute not in frames
           for frames in (my_frames, opp_frames)
           for minute in (start, end)):
        return None
    mine = cs_of(my_frames[end]) - cs_of(my_frames[start])
    opponent = cs_of(opp_frames[end]) - cs_of(opp_frames[start])
    expected = baseline * CS_WINDOW_MIN
    return {
        "window": {"from": clock_of(start * 60000), "to": clock_of(end * 60000)},
        "my_cs_gained": mine,
        "expected_cs": round(expected, 1),
        # Jamais negatif : prendre plus que sa ligne de base n'est pas une perte.
        "cs_missed_est": {"value": max(0, round(expected - mine)),
                          "precision_cs": PRECISION_CS},
        "opp_cs_gained": opponent,
        # Relatif, donc robuste a l'imprecision des frames : c'est sur lui que
        # le prompt fait porter le jugement, pas sur l'estimation absolue.
        "cs_diff_swing": mine - opponent,
    }
