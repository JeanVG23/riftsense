"""Le Riot ID d'un visiteur n'entre jamais tel quel dans l'URL de l'API Riot.

Le tag est strictement contraint côté Worker (`^[A-Za-z0-9]{2,5}$`), le pseudo ne
peut pas l'être autant : les pseudos Riot acceptent le coréen, le cyrillique, le
japonais et les espaces. La protection est donc l'encodage, pas la liste blanche,
et elle vit dans `riotlib` : c'est la seule route qui consomme la clé Riot du
propriétaire avec une chaîne choisie par un inconnu.
"""
from __future__ import annotations

import riotlib as rl

# Un pseudo qui, sans encodage, ferait sortir la requête de l'endpoint account-v1
# pour aller chercher un match arbitraire, avec la clé du propriétaire.
HOSTILE = "../../../lol/match/v5/matches/EUW1_1"


def _client_capturant() -> tuple[rl.RiotClient, list[str]]:
    """Client réel dont seul `_get` est neutralisé : c'est bien le chemin
    construit par `puuid_from_riot_id` que l'on mesure, pas une reformulation."""
    client = rl.RiotClient("cle-de-test", "europe", "euw1", min_interval=0)
    seen: list[str] = []

    def fake_get(base, path, **params):
        seen.append(path)
        return {"puuid": "PUUID"}

    client._get = fake_get  # type: ignore[method-assign]
    return client, seen


def test_le_pseudo_hostile_ne_change_pas_l_endpoint():
    client, seen = _client_capturant()
    client.puuid_from_riot_id(HOSTILE, "euw")
    path = seen[0]
    prefixe = "/riot/account/v1/accounts/by-riot-id/"
    assert path.startswith(prefixe)
    # Deux segments, ni un de plus : le pseudo ne peut plus créer de niveau de
    # chemin, donc plus choisir la ressource appelée.
    assert path[len(prefixe):].count("/") == 1
    assert "/lol/match/" not in path


def test_les_caracteres_de_structure_d_url_sont_encodes():
    client, seen = _client_capturant()
    client.puuid_from_riot_id("a?b&c#d", "euw")
    path = seen[0]
    for char in ("?", "&", "#"):
        assert char not in path
    assert "%3F" in path and "%26" in path and "%23" in path


def test_le_tag_est_encode_aussi():
    """Le tag est validé côté Worker, mais `riotlib` sert aussi la collecte
    locale : l'encodage ne dépend pas de l'appelant."""
    client, seen = _client_capturant()
    client.puuid_from_riot_id("Spadzze", "a/b")
    assert seen[0].endswith("/Spadzze/a%2Fb")


def test_un_pseudo_non_latin_reste_resolvable():
    """L'encodage ne doit pas devenir un refus : un pseudo coréen ou cyrillique
    est légitime et doit passer, simplement percent-encodé."""
    client, seen = _client_capturant()
    client.puuid_from_riot_id("김철수", "kr1")
    assert seen[0].endswith("/%EA%B9%80%EC%B2%A0%EC%88%98/kr1")


def test_un_pseudo_avec_espace_est_encode_sans_etre_casse():
    client, seen = _client_capturant()
    client.puuid_from_riot_id("Le Petit Chat", "euw")
    assert seen[0].endswith("/Le%20Petit%20Chat/euw")
