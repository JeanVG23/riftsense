"""Ingestion d'un joueur : Riot -> raw R2 -> silver/gold KV.

Rien n'est réimplémenté ici : la collecte et l'extraction sont celles du pipeline
local (`riotlib`), et c'est le point. Réécrire l'extraction côté service créerait
une dérive silencieuse avec le dataset ML, exactement ce que ml_features.py
existe pour empêcher.

Le disque du conteneur est éphémère : `data_dir` est un répertoire temporaire par
job, utilisé comme couche médaillon locale (riotlib écrit là), puis vidé vers R2
et KV. Le catalogue statique (`champion_traits.json`, Data Dragon) doit être
présent dans l'image pour que `derive_context` fonctionne (voir Dockerfile) ;
`run` ne déplace pas `champion_profiles.STATIC_DIR`, seulement la pile
`rl.DATA`/`RAW_DIR`/`SILVER_DIR`/`GOLD_DIR`.
"""
from __future__ import annotations

import collections
import json
import os
from datetime import datetime
from pathlib import Path

import requests
import riotlib as rl
from kv_keys import key as kv_key

from errors import NoRankedGames, RiotIdNotFound, RiotUnavailable

# Rôle Riot -> scope du projet ({"adc": "BOTTOM"} lu à l'envers).
_ROLE_TO_SCOPE = {role: scope for scope, role in rl.ROLE_SCOPES.items() if role}


def scopes_for(games: list[dict]) -> list[str]:
    """`all` plus le scope du rôle dominant.

    Le pipeline local agrège une liste centrée ADC (aggregate_games.SCOPES) parce
    qu'il sert un joueur ADC. Un visiteur n'est pas forcément ADC : on agrège son
    rôle réel, majoritaire sur les parties collectées.
    """
    roles = collections.Counter(
        game.get("role") for game in games if game.get("role") in _ROLE_TO_SCOPE
    )
    if not roles:
        return ["all"]
    return ["all", _ROLE_TO_SCOPE[roles.most_common(1)[0][0]]]


def _rank_payload(entries: list[dict]) -> dict:
    """Rang solo/duo courant, même forme que pipeline._write_rank (le frontend
    lit déjà ces champs)."""
    solo = next((e for e in entries if e.get("queueType") == "RANKED_SOLO_5x5"), None)
    return {
        "tier": solo.get("tier") if solo else None,
        "division": solo.get("rank") if solo else None,
        "league_points": solo.get("leaguePoints") if solo else None,
        "wins": solo.get("wins") if solo else None,
        "losses": solo.get("losses") if solo else None,
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
    }


def _push_raw(r2, platform: str, match_ids: list[str]) -> None:
    """Envoie vers R2 les documents raw écrits localement par get_match_timeline."""
    for match_id in match_ids:
        for kind, base in (("match", f"{match_id}_match"),
                           ("timeline", f"{match_id}_timeline")):
            path = rl._raw_path(base)
            if path is not None:
                r2.put_raw(platform, match_id, kind, path.read_bytes())


def run(payload: dict, *, client, kv, r2, data_dir: Path, max_games: int = 20) -> dict:
    """Collecte un joueur et publie ses données. Lève une IngestError typée."""
    slug = payload["slug"]
    riot_id = payload["riot_id"]
    platform = payload["platform"]
    game_name, _, tag_line = riot_id.partition("#")

    # riotlib résout ses chemins depuis rl.DATA À L'APPEL : on redirige la pile
    # médaillon vers le répertoire temporaire du job.
    saved = rl.DATA, rl.RAW_DIR, rl.SILVER_DIR, rl.GOLD_DIR
    rl.DATA = Path(data_dir)
    rl.RAW_DIR = rl.DATA / rl.LAYER_RAW
    rl.SILVER_DIR = rl.DATA / rl.LAYER_SILVER
    rl.GOLD_DIR = rl.DATA / rl.LAYER_GOLD
    try:
        # Espace-clé Riot : tout appel réseau (résolution du puuid, rang, liste des
        # matchs, ET la boucle de collecte ci-dessous qui fait 2 appels par partie,
        # l'écrasante majorité du trafic) doit rendre le même code `riot_unavailable`.
        # `RuntimeError` = épuisement des retries dans `riotlib._get`, même symptôme
        # qu'une `requests.RequestException` non retryée.
        try:
            puuid = client.puuid_from_riot_id(game_name, tag_line)
            if not puuid:
                raise RiotIdNotFound(riot_id)
            entries = client.entries_by_puuid(puuid)
            match_ids = client.match_ids(puuid, count=max_games, queue=rl.QUEUE_SOLO)
            if not match_ids:
                raise NoRankedGames(riot_id)

            games, collected = [], []
            for match_id in match_ids:
                got = rl.get_match_timeline(client, match_id)
                if not got:
                    continue
                game = rl.extract_game(got[0], got[1], puuid)
                if game:
                    games.append(game)
                    collected.append(match_id)
        except (requests.RequestException, RuntimeError) as exc:
            raise RiotUnavailable(str(exc)) from exc
        if not games:
            raise NoRankedGames(riot_id)

        # Amorçage depuis l'historique KV existant : `merge_jsonl` fusionne contre
        # le disque du répertoire temporaire du job, toujours vide sans cette étape,
        # ce qui ferait de la fusion un no-op et écraserait l'historique du joueur
        # à chaque ré-ingestion (`last_ingest_ts` existe précisément pour permettre
        # cette ré-ingestion).
        silver_path = rl.silver_games(rl.KIND_PERSONAL, slug)
        existing_games_raw = kv.get(kv_key("games", slug=slug))
        if existing_games_raw:
            silver_path.parent.mkdir(parents=True, exist_ok=True)
            silver_path.write_text(existing_games_raw)

        merged = rl.merge_jsonl(silver_path, games)
        scopes = scopes_for(merged)
        rl.write_gold(rl.gold_base(rl.KIND_PERSONAL, slug), merged, scopes, player=slug)

        kv.put(kv_key("games", slug=slug), silver_path.read_text())
        kv.put(kv_key("rank", slug=slug),
               json.dumps(_rank_payload(entries), ensure_ascii=False))
        for scope in scopes:
            aggregate = rl.gold_aggregate(rl.KIND_PERSONAL, slug, scope)
            kv.put(kv_key("gold", slug=slug, scope=scope), aggregate.read_text())

        _push_raw(r2, platform, collected)

        existing_raw = kv.get(kv_key("account", slug=slug))
        existing = json.loads(existing_raw) if existing_raw else {}
        account = {
            **existing,
            "slug": slug,
            "riot_id": riot_id,
            "region": platform,
            "puuid": puuid,
            "source": existing.get("source", "public"),
            "created_at": existing.get(
                "created_at", datetime.now().isoformat(timespec="seconds")),
            "last_ingest_ts": datetime.now().isoformat(timespec="seconds"),
        }
        kv.put(kv_key("account", slug=slug), json.dumps(account, ensure_ascii=False))

        raw_index = kv.get(kv_key("accounts_index"))
        slugs = json.loads(raw_index) if raw_index else []
        if slug not in slugs:
            kv.put(kv_key("accounts_index"), json.dumps(slugs + [slug]))

        return {"status": "ok", "n_games": len(games), "slug": slug, "scopes": scopes}
    finally:
        rl.DATA, rl.RAW_DIR, rl.SILVER_DIR, rl.GOLD_DIR = saved


def build_client(platform: str):
    """Client Riot configuré depuis l'environnement du conteneur.

    `RIOT_MIN_INTERVAL` est un paramètre d'environnement, jamais une constante
    recopiée : la clé de développement (défaut prudent 1,3 s) et une éventuelle
    clé de production approuvée (espacement plus court) partagent le même code,
    seule la valeur posée au déploiement change.
    """
    api_key = os.environ.get("RIOT_API_ID")
    if not api_key:
        raise RuntimeError("RIOT_API_ID manquant")
    regional = rl.PLATFORM_TO_REGIONAL.get(platform)
    if not regional:
        raise RiotIdNotFound(f"plateforme inconnue: {platform}")
    interval = float(os.environ.get("RIOT_MIN_INTERVAL", "1.3"))
    return rl.RiotClient(api_key, regional, platform, min_interval=interval)
