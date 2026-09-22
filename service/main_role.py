"""Sélection canonique du rôle principal d'un joueur.

Le coaching global et l'analyse ML/SHAP doivent impérativement parler du même
rôle. La sélection vit donc ici ; ses consommateurs reçoivent le rôle Riot et
son scope de benchmark, sans réimplémenter un vote majoritaire chacun de leur
côté.
"""
from __future__ import annotations

import collections

import role_features as rf


ROLE_TO_SCOPE = {
    "TOP": "top",
    "JUNGLE": "jungle",
    "MIDDLE": "mid",
    "BOTTOM": "adc",
    "UTILITY": "support",
}


def detect(games: list[dict]) -> str | None:
    """Rôle Riot le plus joué, ou ``None`` si aucun rôle n'est exploitable.

    En cas d'égalité, le premier rôle rencontré gagne. Les appelants passent la
    fenêtre de profil dans son ordre de collecte ; ce comportement préserve donc
    la décision historique tout en la rendant commune au SHAP et au coaching.
    """
    counts = collections.Counter(
        normalized
        for game in games
        if game.get("role")
        and (normalized := rf.normalize_role(game["role"])) in ROLE_TO_SCOPE
    )
    return counts.most_common(1)[0][0] if counts else None


def scope(role: str | None) -> str | None:
    """Scope de benchmark associé à un rôle Riot sélectionné."""
    if not role:
        return None
    return ROLE_TO_SCOPE.get(rf.normalize_role(role))


def aggregate_scopes(games: list[dict]) -> list[str]:
    """Scopes à publier : agrégat complet et agrégat du rôle principal."""
    selected = scope(detect(games))
    return ["all", selected] if selected else ["all"]
