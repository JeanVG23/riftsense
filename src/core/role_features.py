"""src/core/role_features.py — manifeste de features PAR RÔLE et catégories de
publication.

`ml_features.FEATURES` est le socle historique, écrit pour l'ADC. Plusieurs de ses
entrées n'ont pas de sens métier hors botlane : `kills_2v2`/`assists_2v2` reposent
sur `my_bot_pids = {my_pid, support_pid}` (riotlib.py:450), `deaths_early_2v2` exige
que les tueurs soient la botlane adverse, et `support_deaths_early` est
structurellement nul pour un support puisque `support_pid == my_pid` rend sa branche
`elif` inatteignable (riotlib.py:476). Les servir quand même reviendrait à publier
des explications fausses, ce qui est exactement ce que le produit ne peut pas faire.

Les trois catégories de publication répondent à un problème distinct : l'EBM est
additif, donc masquer une contribution à l'affichage casserait l'égalité entre la
somme des barres et le score. L'EBM public est donc ENTRAÎNÉ sur `public_features`,
pas seulement filtré à l'affichage.
"""
from __future__ import annotations

import ml_features as mf
import positioning as pos

# ``UTILITY`` est le code technique exposé par l'API Riot. Dans notre domaine et
# dans tous les artefacts publics, le rôle s'appelle ``SUPPORT``.
ROLES: tuple[str, ...] = ("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT")
_RIOT_ROLE_BY_ROLE: dict[str, str] = {**{role: role for role in ROLES},
                                     "SUPPORT": "UTILITY"}


def normalize_role(role: str) -> str:
    """Retourne le nom produit du rôle, en acceptant l'ancien alias Riot."""
    normalized = role.upper()
    return "SUPPORT" if normalized == "UTILITY" else normalized


def riot_role(role: str) -> str:
    """Traduit un nom produit vers ``teamPosition`` de l'API Riot."""
    return _RIOT_ROLE_BY_ROLE[normalize_role(role)]

# Sens métier identique pour les 5 rôles : positionnement, morts par phase, et
# les diffs de lane (calculées contre le MÊME rôle adverse, cf. riotlib `opp_pid`).
_BOTLANE_ONLY = {
    "kills_2v2", "assists_2v2", "deaths_early_2v2", "kda_2v2",
    "support_deaths_early",
}
_LANE_BOUND = {"plates_diff_early"}  # None pour le jungler (cf. turrets.LANE_OF_ROLE)

COMMON_FEATURES: list[str] = [f for f in mf.FEATURES
                              if f not in _BOTLANE_ONLY and f not in _LANE_BOUND]

# Le dataset per-game contient déjà ces écarts contre le mid adverse. Ils sont
# plus comparables entre parties que les valeurs absolues de farm/or/xp du socle
# ADC : un matchup ou une partie rapide affecte les deux mids, tandis que l'écart
# décrit directement l'état de leur lane. On s'arrête à 14 minutes (fin de
# l'early dans ce projet) : ``gd20`` est moins disponible et mélange davantage
# lane, teamfights et résultat de la partie.
MIDDLE_DESCRIPTIVE: tuple[str, ...] = (
    "gd10", "gd14", "csd10", "csd14", "xpd10",
)

# Le CS generique additionne sbires et camps. Pour un jungler, separer les camps
# et leur differentiel de l'impact early rend le profil beaucoup plus lisible.
# Les objectifs sont explicitement un resultat d'equipe, pas une attribution au
# jungler (l'event Riot ne fournit de maniere fiable que ``killerTeamId``).
JUNGLE_DESCRIPTIVE: tuple[str, ...] = (
    "jungle_csm10", "jungle_csm14", "jungle_csd10", "jungle_csd14",
    "jungle_takedowns_early", "jungle_kill_participation_early",
    "jungle_team_epic_monsters_early", "jungle_team_epic_monster_diff_early",
)

ROLE_FEATURES: dict[str, list[str]] = {
    "TOP":     COMMON_FEATURES + ["plates_diff_early"],
    "JUNGLE":  COMMON_FEATURES + list(JUNGLE_DESCRIPTIVE),
    "MIDDLE":  COMMON_FEATURES + ["plates_diff_early", *MIDDLE_DESCRIPTIVE],
    "BOTTOM":  COMMON_FEATURES + ["plates_diff_early", "kills_2v2", "assists_2v2",
                                  "deaths_early_2v2", "kda_2v2",
                                  "support_deaths_early"],
    "SUPPORT": COMMON_FEATURES + ["plates_diff_early", "kills_2v2", "assists_2v2",
                                  "deaths_early_2v2", "kda_2v2"],
}

# Proxys de vision : le joueur ne disposait pas de l'information au moment T, donc
# ils nourrissent le modèle mais ne sont jamais montrés (cf. positioning.ML_ONLY).
HIDDEN_ML_ONLY: set[str] = {f"pos_{name}" for name in pos.ML_ONLY}

# Descriptif : affichable, mais jamais formulé comme un levier à actionner. La
# profondeur de carte en est le cas type, son sens est contre-intuitif.
PUBLIC_DESCRIPTIVE: set[str] = {
    "pos_avg_map_depth", "pos_max_map_depth", "frac_ahead", "frac_behind",
    "kda_1v1", "kda_2v2", "n_deaths", "win_rate", *MIDDLE_DESCRIPTIVE,
    *JUNGLE_DESCRIPTIVE,
}
"""`win_rate` n'est pas dans `mf.FEATURES` (c'est un scalaire de fenêtre, pas une
feature per-game), mais il est servi au modèle par rôle : le ranger ici dit qu'il
s'affiche sans jamais se formuler en levier. « Gagne plus » n'est pas une
prescription."""

PUBLIC_ACTIONABLE: set[str] = (
    set(mf.FEATURES) - HIDDEN_ML_ONLY - PUBLIC_DESCRIPTIVE)


def public_features(role: str) -> list[str]:
    """Features du rôle qui peuvent être servies au public, ordre du manifeste."""
    return [f for f in ROLE_FEATURES[normalize_role(role)]
            if f not in HIDDEN_ML_ONLY]
