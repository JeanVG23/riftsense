"""src/core/kv_keys.py — schéma des clés Cloudflare KV (côté Python).

Le producteur (`sync_cloudflare.py`) construisait ces clés en f-strings dispersées
et le consommateur (`web/cf/src/readers.ts`) porte la même table en TypeScript :
contrat inter-langages sans point unique de vérité, où renommer une clé d'un côté
casse le site en silence, sans erreur de type ni de test.

Deux runtimes, donc deux tables (pas de runtime commun), mais une seule table par
langage et un test de parité qui échoue à la moindre divergence
(cf. tests/test_kv_keys_parity.py).
"""
from __future__ import annotations

# {nom logique: gabarit}. Les paramètres nommés correspondent 1:1 à ceux de
# `KEYS` dans web/cf/src/readers.ts.
TEMPLATES = {
    "games": "silver:{slug}:games",
    "rank": "silver:{slug}:rank",
    "gold": "gold:{slug}:{scope}",
    "ref": "ref:{rank}:{scope}",
    "pred": "pred:{slug}",
    "shap": "shap:{slug}:drivers",
    # Clé DISTINCTE de `shap` : celle-ci porte la décomposition de l'EBM du RÔLE
    # (frontière DIAMOND vs GM+CHALLENGER), `shap` celle de l'EBM per-player ADC.
    # Les fondre servirait un modèle sous le nom d'un autre.
    "role_shap": "shap:{slug}:role",
    # Mémoire des parties déjà classées hors rôle : sans elle, jusqu'à 80 parties
    # écartées seraient repayées à chaque actualisation (le silver ne garde que ce
    # qui a été extrait, donc jamais les parties d'un autre rôle).
    "scan_index": "riftsense:{slug}:scan-index",
    "reviews": "riftsense:{slug}:reviews",
    "feedback": "riftsense:{slug}:feedback",
    "chats": "riftsense:{slug}:chats",
    "game_payloads": "riftsense:{slug}:game-payloads",
    "account": "account:{slug}",
    "accounts_index": "accounts:index",
}


def key(name: str, **params: str) -> str:
    """Clé KV pour `name`. Lève KeyError sur un nom inconnu, et le formatage
    lève sur un paramètre manquant (plutôt que produire une clé silencieusement
    fausse comme une f-string mal recopiée)."""
    return TEMPLATES[name].format(**params)
