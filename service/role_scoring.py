"""Analyse ML par rôle d'un visiteur : chargement, éligibilité, fenêtre, score.

Le service ne sert un modèle que si la table d'ouverture le déclare ouvert ET si
l'export embarqué vient du même entraînement que la marge publiée. Les deux
vérifications sont ici, pas dans l'appelant : une garde dispersée finit par être
oubliée d'un côté.
"""
from __future__ import annotations

import collections
import json
import math
from pathlib import Path
from typing import NamedTuple

import pandas as pd

import ebm_lookup
import game_rows
import ml_features as mf
import role_features as rf

SCHEMA_VERSION = 1
COVERED_TIERS = frozenset({"DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"})
"""MASTER est couvert bien qu'exclu de l'entraînement. La frontière servie est
DIAMOND contre GM+CHALLENGER. En dessous de Diamant, aucune population
d'entraînement n'est couverte et le service ne rend aucun score."""


class RoleModel(NamedTuple):
    """Modèle d'un rôle, et la raison pour laquelle il serait inutilisable."""

    export: dict | None
    readiness: dict | None
    reason: str | None


def load_models(model_dir: Path) -> dict[str, RoleModel]:
    """Charge les cinq exports et la table, une fois par processus."""
    table_path = Path(model_dir) / "role_readiness.json"
    rows = json.loads(table_path.read_text()) if table_path.exists() else []
    table = {rf.normalize_role(row["role"]): row for row in rows}

    models = {}
    for role in rf.ROLES:
        readiness = table.get(role)
        path = Path(model_dir) / f"{role.lower()}_ebm_export.json"
        if not path.exists() or readiness is None:
            models[role] = RoleModel(None, readiness, "model_missing")
            continue
        export = json.loads(path.read_text())
        if (export.get("schema_version") != ebm_lookup.SCHEMA_VERSION
                or export.get("model_id") != readiness.get("model_id")
                or (readiness.get("boundary") is not None
                    and export.get("boundary") != readiness["boundary"])):
            models[role] = RoleModel(export, readiness, "model_mismatch")
            continue
        models[role] = RoleModel(export, readiness, None)
    return models


def preflight_eligibility(role: str, tier: str | None,
                          models: dict[str, RoleModel]) -> str | None:
    """Motif de non-éligibilité décidable avant la collecte profonde, ou None."""
    model = models.get(rf.normalize_role(role))
    if model is None:
        return "model_missing"
    if model.reason:
        return model.reason
    readiness = model.readiness or {}
    if not (readiness.get("open") is True
            and readiness.get("corpus") == "production"):
        return "role_closed"
    if (tier or "").upper() not in COVERED_TIERS:
        return "rank_out_of_scope"
    return None


def dominant_role(games: list[dict]) -> str | None:
    """Rôle le plus joué parmi les parties, ou None si aucun n'est exploitable."""
    counts = collections.Counter(
        rf.normalize_role(game["role"]) for game in games
        if game.get("role") and rf.normalize_role(game["role"]) in rf.ROLES)
    return counts.most_common(1)[0][0] if counts else None


def role_games(games: list[dict], role: str) -> list[dict]:
    """Parties du rôle, de la plus récente à la plus ancienne."""
    role = rf.normalize_role(role)
    mine = [game for game in games
            if game.get("role") and rf.normalize_role(game["role"]) == role]
    return sorted(mine, key=lambda game: game.get("game_ts") or 0, reverse=True)


def build_window(games: list[dict], role: str, n: int) -> dict:
    """Agrégat des `n` dernières parties du rôle, identique à l'entraînement."""
    role = rf.normalize_role(role)
    window = role_games(games, role)[:n]
    frame = pd.DataFrame([game_rows.game_to_row(game) for game in window])
    aggregates = mf.aggregate_player_features(frame, rf.ROLE_FEATURES[role])
    aggregates.pop("n_games", None)
    return aggregates


def _base_of(feature: str) -> str:
    """Rend le nom de feature avant son suffixe d'agrégation."""
    return feature.split("__", 1)[0]


def _category_of(feature: str) -> str:
    base = _base_of(feature)
    if base in rf.PUBLIC_ACTIONABLE:
        return "actionable"
    return "descriptive"


def score(model: RoleModel, window: dict, sample: dict) -> dict:
    """Décomposition complète, triée par poids absolu décroissant."""
    export = model.export
    if export is None:
        raise ValueError("modèle absent")
    shapes = export.get("shapes") or {}
    contributions = ebm_lookup.contributions(export, window)
    drivers = [{
        "feature": name,
        "base": _base_of(name),
        "value": _jsonable(window.get(name)),
        "contribution": contributions[name],
        "crossover_value": (shapes.get(name) or {}).get("crossover_value"),
        "direction": (shapes.get(name) or {}).get("direction"),
        "category": _category_of(name),
    } for name in export["features"]]
    drivers.sort(key=lambda driver: (-abs(driver["contribution"]), driver["feature"]))
    assert not any(driver["base"] in rf.HIDDEN_ML_ONLY for driver in drivers), \
        "un proxy HIDDEN_ML_ONLY a atteint le payload publié"
    readiness = model.readiness or {}
    return {
        "schema_version": SCHEMA_VERSION,
        "available": True,
        "role": export["role"],
        "model": {
            "model_id": export["model_id"],
            "boundary": export["boundary"],
            "population": export["population"],
            "auc_heldout_median": readiness.get("auc_ebm"),
            "n_seeds": readiness.get("n_seeds"),
            "corpus": readiness.get("corpus"),
        },
        "sample": sample,
        "intercept": export["intercept"],
        "logit": ebm_lookup.logit(export, window),
        "drivers": drivers,
    }


def _jsonable(value):
    """NaN et Infinity ne sont pas du JSON : une feature absente devient null."""
    if value is None:
        return None
    number = float(value)
    return number if math.isfinite(number) else None
