"""Ingestion d'un joueur : Riot -> raw R2 -> silver/gold et journaux KV.

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

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

import requests
import riotlib as rl
import role_features as rf
import payload as coaching_payload
from kv_keys import key as kv_key

import main_role
import role_scoring
from errors import NoRankedGames, RiotIdNotFound, RiotUnavailable

PROFILE_GAMES = 20
TARGET_ROLE_GAMES = 20
MAX_HISTORY_SCANNED = 100
MAX_FETCH_FAILURES = 5
DEEP_PHASE_DEADLINE_S = 480
GAME_PAYLOAD_GAMES = 50
GAME_PAYLOAD_TARGET = "challenger"


class WindowHarvest(NamedTuple):
    """Résultat de la collecte ciblée qui complète la fenêtre d'un rôle."""

    games: list[dict]
    collected: list[str]
    failures: int
    examined: int
    deadline_reached: bool

def scopes_for(games: list[dict]) -> list[str]:
    """`all` plus le scope du rôle dominant.

    Le pipeline local agrège une liste centrée ADC (aggregate_games.SCOPES) parce
    qu'il sert un joueur ADC. Un visiteur n'est pas forcément ADC : on agrège son
    rôle réel, majoritaire sur les parties collectées.
    """
    return main_role.aggregate_scopes(games)


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


def _raw_loader(r2, platform: str):
    """Raw local d'abord, puis R2 avec cache dans le répertoire du job."""
    def load(base: str) -> dict | None:
        local = rl._read_raw(base)
        if local is not None:
            return local
        for suffix, kind in (("_match", "match"), ("_timeline", "timeline")):
            if not base.endswith(suffix):
                continue
            match_id = base[:-len(suffix)]
            blob = r2.get_raw(platform, match_id, kind)
            if blob is None:
                return None
            path = rl.raw_dir() / f"{base}.json.zst"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob)
            return rl._read_raw_at(path)
        return None
    return load


def _ref_loader(kv, target: str):
    """Référentiels KV chargés paresseusement et au plus une fois par scope."""
    cache: dict[str, dict] = {}

    def load(scope: str) -> dict:
        if scope not in cache:
            raw = kv.get(kv_key("ref", rank=target, scope=scope))
            if raw is None:
                raise FileNotFoundError(f"référentiel {target}/{scope} absent de KV")
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError(f"référentiel {target}/{scope} invalide")
            cache[scope] = value
        return cache[scope]
    return load


def _existing_game_bundle(kv, slug: str) -> dict | None:
    raw = kv.get(kv_key("game_payloads", slug=slug))
    if raw is None:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def role_in_match(match: dict, puuid: str) -> str | None:
    """Rôle produit du joueur dans ce match, ou None s'il n'y figure pas."""
    meta = (match or {}).get("metadata", {})
    participants = meta.get("participants", [])
    if puuid not in participants:
        return None
    parts = match.get("info", {}).get("participants", [])
    index = participants.index(puuid)
    if index >= len(parts):
        return None
    position = parts[index].get("teamPosition")
    return rf.normalize_role(position) if position else None


def collect_role_window(client, puuid: str, match_ids: list[str], role: str, *,
                        needed: int, scan_index: dict[str, str],
                        deadline: float) -> WindowHarvest:
    """Complète la fenêtre du rôle en payant le moins possible."""
    riot_role = rf.riot_role(role)
    games, collected, failures, examined = [], [], 0, 0
    for match_id in match_ids:
        if len(games) >= needed:
            break
        if time.monotonic() >= deadline:
            return WindowHarvest(games, collected, failures, examined, True)
        if failures > MAX_FETCH_FAILURES:
            break
        known = scan_index.get(match_id)
        if known is not None and known != role:
            continue
        examined += 1
        result = rl.fetch_match_timeline(
            client, match_id, target_puuid=puuid, target_role=riot_role)
        if result.status == "role_mismatch":
            observed = role_in_match(result.match, puuid)
            if observed:
                scan_index[match_id] = observed
            continue
        if result.status == "failed":
            failures += 1
            continue
        scan_index[match_id] = role
        game = rl.extract_game(result.match, result.timeline, puuid)
        if game:
            games.append(game)
            collected.append(match_id)
    return WindowHarvest(games, collected, failures, examined, False)


def _load_scan_index(kv, slug: str) -> dict[str, str]:
    raw = kv.get(kv_key("scan_index", slug=slug))
    return json.loads(raw) if raw else {}


def _role_analysis(role: str | None, reason: str | None, merged: list[dict],
                   models: dict, sample: dict) -> dict:
    """Union discriminée par `available`, écrite à chaque ingestion réussie."""
    now = datetime.now().isoformat(timespec="seconds")
    if reason is None and len(role_scoring.role_games(merged, role)) < TARGET_ROLE_GAMES:
        reason = ("collection_incomplete"
                  if sample.get("fetch_failures") or sample.get("deadline_reached")
                  else "window_too_short")
    if reason is None:
        try:
            window = role_scoring.build_window(merged, role, TARGET_ROLE_GAMES)
            return {**role_scoring.score(models[role], window, sample),
                    "scope": main_role.scope(role), "generated_at": now}
        except Exception:  # noqa: BLE001 : l'ingestion doit rester disponible
            print(f"  ⚠ scoring par rôle échoué pour {role}", file=sys.stderr)
            reason = "scoring_failed"
    return {"schema_version": role_scoring.SCHEMA_VERSION, "generated_at": now,
            "available": False, "reason": reason, "role": role,
            "scope": main_role.scope(role)}


def run(payload: dict, *, client, kv, r2, data_dir: Path,
        models: dict | None = None,
        max_games: int = PROFILE_GAMES) -> dict:
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
        failed = 0
        try:
            puuid = client.puuid_from_riot_id(game_name, tag_line)
            if not puuid:
                raise RiotIdNotFound(riot_id)
            entries = client.entries_by_puuid(puuid)
            match_ids = client.match_ids(
                puuid, count=MAX_HISTORY_SCANNED, queue=rl.QUEUE_SOLO)
            if not match_ids:
                raise NoRankedGames(riot_id)

            # Amorçage depuis l'historique KV existant : `merge_jsonl` fusionne contre
            # le disque du répertoire temporaire du job, toujours vide sans cette étape.
            # On extrait aussi les match_ids déjà connus pour ne collecter QUE les nouvelles
            # parties (gain majeur lors d'un « Actualiser » : 2 appels au lieu de 40).
            silver_path = rl.silver_games(rl.KIND_PERSONAL, slug)
            existing_games_raw = kv.get(kv_key("games", slug=slug))
            existing_match_ids: set[str] = set()
            if existing_games_raw:
                silver_path.parent.mkdir(parents=True, exist_ok=True)
                silver_path.write_text(existing_games_raw)
                for line in existing_games_raw.splitlines():
                    if line.strip():
                        try:
                            g = json.loads(line)
                            mid = g.get("match_id")
                            if mid:
                                existing_match_ids.add(mid)
                        except json.JSONDecodeError:
                            pass

            profile_ids = match_ids[:max_games]
            new_match_ids = [mid for mid in profile_ids if mid not in existing_match_ids]

            games, collected, profile = [], [], {}
            for match_id in new_match_ids:
                # `rl.get_match_timeline` avale ses propres exceptions réseau et
                # rend None (code partagé avec le pilote local, qui préfère sauter
                # une partie plutôt que d'interrompre un scraping de plusieurs
                # heures). La garde `except` ci-dessous est donc INERTE sur cette
                # boucle : sans ce comptage, une panne Riot survenue après
                # `match_ids` produirait zéro partie et serait annoncée au visiteur
                # comme « aucune partie classée », c'est-à-dire un doute sur son
                # compte au lieu d'un diagnostic sur le service.
                got = rl.get_match_timeline(client, match_id)
                if not got:
                    failed += 1
                    continue
                # `extract_game` qui rend None n'est PAS un échec : c'est un filtre
                # (patch, file, carte) qui a fait son travail sur une partie
                # correctement téléchargée.
                game = rl.extract_game(got[0], got[1], puuid)
                if game:
                    games.append(game)
                    collected.append(match_id)
                    # `match_ids` est rendu du plus récent au plus ancien : la
                    # première partie retenue porte l'icône et le niveau les
                    # moins périmés.
                    profile = profile or rl.summoner_profile(got[0], puuid)
        except (requests.RequestException, RuntimeError) as exc:
            raise RiotUnavailable(str(exc)) from exc
        if not games and not existing_match_ids:
            if failed:
                raise RiotUnavailable(
                    f"{failed} partie(s) non collectée(s) sur {len(match_ids)}")
            raise NoRankedGames(riot_id)
        if failed and not games:
            raise RiotUnavailable(
                f"{failed} partie(s) non collectée(s) sur {len(new_match_ids)}")

        silver_path = rl.silver_games(rl.KIND_PERSONAL, slug)
        merged = rl.merge_jsonl(silver_path, games)

        deadline = time.monotonic() + DEEP_PHASE_DEADLINE_S
        models = models if models is not None else {}
        tier = _rank_payload(entries).get("tier")
        profile_id_set = set(profile_ids)
        profile_games = [game for game in merged
                         if game.get("match_id") in profile_id_set]
        role = main_role.detect(profile_games)
        reason = (role_scoring.preflight_eligibility(role, tier, models)
                  if role else "window_too_short")

        harvest = WindowHarvest([], [], 0, 0, False)
        scan_index = _load_scan_index(kv, slug)
        if reason is None:
            missing = TARGET_ROLE_GAMES - len(role_scoring.role_games(merged, role))
            if missing > 0:
                deep_ids = [match_id for match_id in
                            match_ids[max_games:MAX_HISTORY_SCANNED]
                            if match_id not in existing_match_ids]
                harvest = collect_role_window(
                    client, puuid, deep_ids, role, needed=missing,
                    scan_index=scan_index, deadline=deadline)
                merged = rl.merge_jsonl(silver_path, harvest.games)
                collected += harvest.collected
        kv.put(kv_key("scan_index", slug=slug),
               json.dumps(scan_index, ensure_ascii=False))

        # Le SHAP et le coaching consomment exactement le rôle décidé sur la
        # fenêtre de profil. Ne pas revoter sur l'historique enrichi : celui-ci
        # contient justement davantage de parties du rôle déjà choisi.
        scopes = scopes_for(profile_games)
        rl.write_gold(rl.gold_base(rl.KIND_PERSONAL, slug), merged, scopes, player=slug)

        # Le raw doit être durable avant que KV rende la game visible. Le bundle
        # réutilise les payloads valides et ne relit R2 que pour les trous de la
        # fenêtre ; les nouvelles parties sont encore dans le cache local du job.
        if collected:
            _push_raw(r2, platform, collected)
        bundle = coaching_payload.build_game_bundle(
            slug,
            records=merged,
            target=GAME_PAYLOAD_TARGET,
            max_games=GAME_PAYLOAD_GAMES,
            load_raw=_raw_loader(r2, platform),
            load_ref=_ref_loader(kv, GAME_PAYLOAD_TARGET),
            existing=_existing_game_bundle(kv, slug),
        )
        encoded_bundle = coaching_payload.encode_game_bundle(bundle)

        # Pas de transaction multi-clés dans Workers KV. Publier le bundle avant
        # games rend une éventuelle écriture partielle inoffensive : un payload
        # en avance est invisible, une game en avance serait affichée sans journal.
        kv.put(kv_key("game_payloads", slug=slug), encoded_bundle)
        kv.put(kv_key("games", slug=slug), silver_path.read_text())
        kv.put(kv_key("rank", slug=slug),
               json.dumps(_rank_payload(entries), ensure_ascii=False))
        for scope in scopes:
            aggregate = rl.gold_aggregate(rl.KIND_PERSONAL, slug, scope)
            kv.put(kv_key("gold", slug=slug, scope=scope), aggregate.read_text())

        existing_raw = kv.get(kv_key("account", slug=slug))
        existing = json.loads(existing_raw) if existing_raw else {}
        account = {
            **existing,
            "slug": slug,
            "riot_id": riot_id,
            "region": platform,
            "puuid": puuid,
            "source": existing.get("source", "public"),
            # Après `existing` : une collecte fraîche prime sur ce que le fichier
            # de configuration avait amorcé. `profile` peut être vide (participant
            # introuvable) ; l'ancienne valeur survit alors au lieu d'être effacée.
            **profile,
            "created_at": existing.get(
                "created_at", datetime.now().isoformat(timespec="seconds")),
            "last_ingest_ts": datetime.now().isoformat(timespec="seconds"),
        }
        kv.put(kv_key("account", slug=slug), json.dumps(account, ensure_ascii=False))

        raw_index = kv.get(kv_key("accounts_index"))
        slugs = json.loads(raw_index) if raw_index else []
        if slug not in slugs:
            kv.put(kv_key("accounts_index"), json.dumps(slugs + [slug]))

        sample = {
            "profile_examined": len(profile_ids),
            "history_examined": len(profile_ids) + harvest.examined,
            "role_games_in_profile": len(role_scoring.role_games(profile_games, role))
                                     if role else 0,
            "role_games_used": min(
                TARGET_ROLE_GAMES, len(role_scoring.role_games(merged, role)))
                if role else 0,
            "new_games_collected": len(collected),
            "fetch_failures": failed + harvest.failures,
            "deadline_reached": harvest.deadline_reached,
        }
        kv.put(kv_key("role_shap", slug=slug), json.dumps(
            _role_analysis(role, reason, merged, models, sample),
            ensure_ascii=False, allow_nan=False))

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
