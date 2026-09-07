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


SPIKE_WINDOW_S = 120        # visite adverse consideree comme concomitante
RECALL_DEATH_WINDOW_S = 90  # mort attribuee au retour en lane


def classify_visit(item_ids: list[int], items: dict | None) -> dict | None:
    """Bénéfice d'une visite de shop : gold dépensé, objets FINIS, spike ou non.

    Sans catalogue (ou sans aucun item connu), le bloc est omis : les
    consommateurs existants du journal ne voient alors aucune différence.

    `finished_items` ne porte QUE le nom et le coût. Les ids bruts sont
    délibérément absents : `payload._resolve_recall_items` les retire de la vue
    du LLM, les réintroduire ici annulerait la règle.
    """
    if not items or not item_ids:
        return None
    rows = [items[iid] for iid in item_ids if iid in items]
    if not rows:
        return None
    finished = [{"name": row["name"], "cost": row["cost"]}
                for row in rows if row.get("finished")]
    return {"gold_spent": sum(int(row.get("cost") or 0) for row in rows),
            "finished_items": finished,
            "is_spike": bool(finished)}


def opponent_spike(opp_visits: list[dict], t0: int,
                   items: dict | None) -> dict | None:
    """Visite de l'adversaire de lane terminant un objet dans ±120 s de la mienne.

    `delta_s` est SIGNÉ : négatif, l'adversaire a spiké avant ma visite.
    ASYMÉTRIE : les objets d'un adversaire de lane sont lisibles au scoreboard,
    c'est une information que le joueur avait.
    """
    best = None
    for visit in opp_visits or []:
        t = visit.get("t_ms")
        if not isinstance(t, int) or abs(t - t0) > SPIKE_WINDOW_S * 1000:
            continue
        outcome = classify_visit(visit.get("item_ids") or [], items)
        if not outcome or not outcome["finished_items"]:
            continue
        if best is None or abs(t - t0) < abs(best[0] - t0):
            best = (t, outcome)
    if best is None:
        return None
    t, outcome = best
    return {"clock": clock_of(t), "delta_s": round((t - t0) / 1000),
            "items": [item["name"] for item in outcome["finished_items"]]}


def death_after_visit(death_times: list[int], t0: int) -> dict | None:
    """Première mort dans les 90 s SUIVANT la visite, sinon None.

    La timeline n'horodate pas le retour en lane : la fenêtre couvre le trajet
    plus les premières secondes de lane. Bornes strictes à gauche (une mort
    simultanée à l'achat est le reset qui suit cette mort, pas sa conséquence).
    """
    for t in sorted(death_times or []):
        if t0 < t <= t0 + RECALL_DEATH_WINDOW_S * 1000:
            return {"clock": clock_of(t), "delta_s": round((t - t0) / 1000)}
    return None
