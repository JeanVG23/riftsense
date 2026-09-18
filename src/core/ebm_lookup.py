"""src/core/ebm_lookup.py : un EBM réduit à une table de correspondance JSON.

`interactions=0` veut dire que tous les termes sont univariés : le modèle se réduit
exactement à un intercept plus, par feature, des bornes et des scores. Ce module
l'exporte et le réévalue sans `interpret`.

Pourquoi ne pas embarquer le pickle : un ExplainableBoostingClassifier ne se recharge
que si la version d'`interpret` correspond à celle qui l'a écrit, et les dépendances
du service sont bornées en `>=`. Un export est de la donnée, pas du code : il n'a pas
de version à faire correspondre, et il dispense le conteneur d'interpret, scikit-learn
et scipy.

⚠️ La disposition des bins n'est pas une convention choisie ici, c'est celle du
modèle : len(term_scores_[i]) == len(bins_[i][0]) + 3, indice 0 pour les valeurs
manquantes, `searchsorted(cuts, v, "right") + 1` pour la valeur, dernier indice pour
le bin inconnu (inutilisé en continu). `tests/test_ebm_lookup.py` la vérifie contre
`eval_terms`, y compris sur chaque borne : c'est ce test qui fait foi, pas ce texte.
"""
from __future__ import annotations

import bisect
import hashlib
import json
import math

SCHEMA_VERSION = 1


def _finite(value, what: str) -> float:
    """Refuse une valeur non finie plutôt que de la sérialiser en null.

    Une borne ou un score non fini rendrait la table inévaluable. Échouer ici est
    bruyant ; laisser passer un null produirait un score faux, silencieusement.
    """
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{what} non fini : {value!r}")
    return result


def export_model(ebm, features: list[str], *, role: str, boundary: str,
                 population: dict, shapes: dict) -> dict:
    """Table de correspondance complète d'un EBM à effets principaux."""
    terms = {}
    for index, name in enumerate(features):
        cuts = [_finite(c, f"borne de {name}") for c in ebm.bins_[index][0]]
        scores = [_finite(s, f"score de {name}") for s in ebm.term_scores_[index]]
        if len(scores) != len(cuts) + 3:
            raise ValueError(
                f"disposition inattendue pour {name} : {len(cuts)} bornes pour "
                f"{len(scores)} scores (attendu {len(cuts) + 3})")
        terms[name] = {"cuts": cuts, "scores": scores}
    payload = {
        "schema_version": SCHEMA_VERSION,
        "role": role,
        "boundary": boundary,
        "population": population,
        "features": list(features),
        "intercept": _finite(ebm.intercept_[0], "intercept"),
        "terms": terms,
        "shapes": shapes,
    }
    payload["model_id"] = compute_model_id(payload)
    return payload


def compute_model_id(payload: dict) -> str:
    """Empreinte de ce qui détermine un score. `shapes` en est exclu : c'est de la
    lecture, pas du calcul, et le faire entrer ferait changer l'identité du modèle
    pour un résumé recalculé."""
    material = json.dumps(
        {key: payload[key] for key in
         ("role", "boundary", "features", "intercept", "terms")},
        sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(material.encode()).hexdigest()[:16]


def _bin_index(cuts: list[float], value) -> int:
    """0 pour une valeur manquante, sinon le bin du modèle.

    `bisect_right` est l'équivalent de numpy.searchsorted(side="right") sans numpy.
    """
    if value is None:
        return 0
    number = float(value)
    if math.isnan(number):
        return 0
    return bisect.bisect_right(cuts, number) + 1


def contributions(export: dict, row: dict) -> dict[str, float]:
    """Contribution de chaque feature, dans l'ordre du manifeste."""
    terms = export["terms"]
    return {name: terms[name]["scores"][_bin_index(terms[name]["cuts"], row.get(name))]
            for name in export["features"]}


def logit(export: dict, row: dict) -> float:
    """Somme des contributions plus l'intercept. Exact par construction : c'est la
    définition d'un modèle additif, pas une approximation."""
    return export["intercept"] + sum(contributions(export, row).values())
