#!/usr/bin/env python3
"""backfill_summoner_profiles : icone et niveau des comptes deja collectes.

Le service d'ingestion publie `icon` et `level` depuis Match-V5 a chaque
collecte. Les comptes ingeres AVANT cette lecture n'en ont pas, et le site leur
affiche une icone tiree du hachage de leur slug. Rien ne les rattrape tout seul :
les deux champs n'apparaissent qu'a la prochaine collecte, qui coute une
quarantaine d'appels Riot pour une donnee qui en vaut un.

Ce script relit la partie la plus recente de chaque compte et n'ecrit que les
deux champs manquants. La partie est cherchee d'abord dans le cache raw local
(zero appel), sinon telechargee : son identifiant est deja connu, il vient du
silver publie en KV, donc un appel suffit la ou une collecte en depenserait
quarante.

Usage :
    poetry run python3 src/collection/backfill_summoner_profiles.py [--dry-run] [--force]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "core"))

import riotlib as rl  # noqa: E402
from cli import flag  # noqa: E402
from kv_client import KV  # noqa: E402
from kv_keys import key as kv_key  # noqa: E402


class ReadOnlyKV(KV):
    """Lit la vraie base, journalise les ecritures sans les faire.

    `DryKV` ne convient pas ici : il rend None a toute lecture, donc un dry-run
    ne verrait aucun compte et ne dirait rien de ce qu'il aurait ecrit.
    """

    def put(self, key: str, value: str) -> None:
        del value
        self.puts.append(key)


def newest_game(games_jsonl: str | None) -> dict | None:
    """Partie la plus recente du silver publie (porte match_id et puuid).

    La plus recente et pas la premiere venue : l'icone et le niveau qu'elle
    contient sont ceux du jour de cette partie.
    """
    rows = [json.loads(line)
            for line in (games_jsonl or "").splitlines() if line.strip()]
    return max(rows, key=lambda row: row.get("game_ts") or 0) if rows else None


def incomplet(account: dict) -> bool:
    return not isinstance(account.get("icon"), int) \
        or not isinstance(account.get("level"), int)


def backfill(kv, read_match, *, force: bool = False) -> dict[str, dict]:
    """Complete `icon`/`level` sur les comptes du registre. Rend les ecritures."""
    raw_index = kv.get(kv_key("accounts_index"))
    ecrits: dict[str, dict] = {}
    for slug in (json.loads(raw_index) if raw_index else []):
        raw_account = kv.get(kv_key("account", slug=slug))
        account = json.loads(raw_account) if raw_account else None
        if not account:
            print(f"  {slug} : indexe sans enregistrement, ignore")
            continue
        if not force and not incomplet(account):
            continue
        game = newest_game(kv.get(kv_key("games", slug=slug)))
        if not game:
            print(f"  {slug} : aucune partie publiee, rien a relire")
            continue
        match = read_match(account.get("region", "euw1"), game["match_id"])
        profile = rl.summoner_profile(match, game["puuid"]) if match else {}
        if not profile:
            # Ni ecriture ni echec : un compte qu'on ne sait pas completer ne
            # doit pas empecher de completer les suivants.
            print(f"  {slug} : profil absent de {game['match_id']}, ignore")
            continue
        kv.put(kv_key("account", slug=slug),
               json.dumps({**account, **profile}, ensure_ascii=False))
        ecrits[slug] = profile
        print(f"  {slug} : icone {profile.get('icon')}, niveau {profile.get('level')}")
    return ecrits


def match_reader(api_key: str | None):
    """Lecteur de partie : cache raw local d'abord, API Riot ensuite.

    Un document de match est immuable : le retelecharger alors qu'il est sur le
    disque depenserait un appel pour un contenu identique. Les clients sont
    construits a la demande, un par plateforme, donc aucun si tout est en cache.
    """
    clients: dict[str, rl.RiotClient] = {}

    def read(region: str, match_id: str) -> dict | None:
        local = rl._read_raw(f"{match_id}_match")
        if local:
            return local
        if not api_key:
            raise SystemExit("RIOT_API_ID manquant : partie absente du cache local")
        if region not in clients:
            regional = rl.PLATFORM_TO_REGIONAL.get(region)
            if not regional:
                print(f"  plateforme inconnue : {region}")
                return None
            clients[region] = rl.RiotClient(api_key, regional, region)
        return clients[region].match(match_id)

    return read


def main(argv: list[str] | None = None) -> int:
    del argv
    env = rl.load_env()
    account = os.environ.get("CF_ACCOUNT_ID") or env.get("CF_ACCOUNT_ID")
    namespace = (os.environ.get("CF_NAMESPACE_ID")
                 or os.environ.get("CF_KV_NAMESPACE_ID")
                 or env.get("CF_NAMESPACE_ID")
                 or env.get("CF_KV_NAMESPACE_ID"))
    token = os.environ.get("CF_API_TOKEN") or env.get("CF_API_TOKEN")
    if not account or not namespace or not token:
        raise SystemExit(
            "CF_API_TOKEN / CF_ACCOUNT_ID / CF_NAMESPACE_ID manquants dans .env")

    dry = flag("--dry-run")
    kv = ReadOnlyKV(account, namespace, token) if dry \
        else KV(account, namespace, token)
    api_key = os.environ.get("RIOT_API_ID") or env.get("RIOT_API_ID")
    ecrits = backfill(kv, match_reader(api_key), force=flag("--force"))
    print(f"{len(ecrits)} compte(s) {'a completer' if dry else 'completes'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
