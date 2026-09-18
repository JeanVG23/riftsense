#!/usr/bin/env python3
"""Snapshot daté du ladder, source unique du label de rang.

Un fichier est écrit par jour et n'est lisible qu'après inscription dans le
manifeste. Ainsi, une collecte interrompue pendant la pagination ne peut pas
être confondue avec un snapshot complet.

Usage : poetry run python3 src/collection/fetch_ladder.py [--platform euw1]
        [--day AAAA-MM-JJ]
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
import zstandard as zstd  # noqa: E402

import cli  # noqa: E402
import riotlib as rl  # noqa: E402
import settings  # noqa: E402

SNAPSHOT_ROOT = rl.DATA / "01_raw" / "rank_snapshots"
_APEX_TIERS = ("challenger", "grandmaster", "master")
_DIAMOND_DIVISIONS = ("I", "II", "III", "IV")
_MAX_PAGES = 500


def _row(entry: dict, tier: str, division: str) -> dict:
    return {
        "puuid": entry["puuid"],
        "tier": tier,
        "division": division,
        "lp": entry.get("leaguePoints"),
        "wins": entry.get("wins"),
        "losses": entry.get("losses"),
    }


def snapshot_rows(client) -> Iterator[dict]:
    """Produit une ligne par joueur apex/diamond, dédoublonnée par PUUID.

    Seule une page VIDE termine une division : league-exp rend régulièrement des
    pages plus courtes que la taille nominale sans que le ladder soit épuisé, et
    s'arrêter dessus amputerait la division de quelques centaines de joueurs.
    """
    seen: set[str] = set()
    for tier in _APEX_TIERS:
        for entry in client.apex_league(tier):
            puuid = entry.get("puuid")
            if puuid and puuid not in seen:
                seen.add(puuid)
                yield _row(entry, tier.upper(), "I")

    for division in _DIAMOND_DIVISIONS:
        for page in range(1, _MAX_PAGES + 1):
            entries = client.league_exp_entries("DIAMOND", division, page)
            if not entries:
                break
            for entry in entries:
                puuid = entry.get("puuid")
                if puuid and puuid not in seen:
                    seen.add(puuid)
                    yield _row(entry, "DIAMOND", division)


def _day_path(platform: str, day: str, root: Path) -> Path:
    return Path(root) / platform / f"{day}.jsonl.zst"


def _manifest_path(platform: str, root: Path) -> Path:
    return Path(root) / platform / "manifest.json"


def _write_atomic(path: Path, payload: bytes) -> None:
    """Publie un fichier d'un seul coup, après flush sur disque."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    with temporary.open("wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _write_manifest(path: Path, manifest: dict) -> None:
    _write_atomic(path, json.dumps(
        manifest, indent=2, sort_keys=True).encode())


def write_snapshot(rows, platform: str, day: str,
                   root: Path = SNAPSHOT_ROOT) -> Path:
    """Compresse les lignes JSON du snapshot sans le marquer comme complet."""
    path = _day_path(platform, day, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Invalide d'abord une éventuelle collecte du même jour. Si le processus
    # s'arrête ensuite, l'ancien complete=true ne peut pas valider le nouveau blob.
    manifest_path = _manifest_path(platform, root)
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest[day] = {"complete": False}
    _write_manifest(manifest_path, manifest)
    payload = "".join(json.dumps(row) + "\n" for row in rows).encode()
    _write_atomic(path, zstd.ZstdCompressor(level=10).compress(payload))
    return path


def mark_complete(platform: str, day: str, root: Path = SNAPSHOT_ROOT,
                  n_rows: int = 0, captured_at_ms: int | None = None) -> None:
    """Inscrit une journée achevée et son nombre de lignes au manifeste."""
    path = _manifest_path(platform, root)
    manifest = json.loads(path.read_text()) if path.exists() else {}
    manifest[day] = {"complete": True, "n_rows": n_rows}
    if captured_at_ms is not None:
        manifest[day]["captured_at_ms"] = captured_at_ms
    _write_manifest(path, manifest)


def load_snapshot(platform: str, day: str,
                  root: Path = SNAPSHOT_ROOT) -> dict[str, dict]:
    """Charge un snapshot complet, indexé par PUUID.

    Une journée absente du manifeste ou non marquée complète est refusée,
    même si son fichier existe sur disque.
    """
    manifest_path = _manifest_path(platform, root)
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if not manifest.get(day, {}).get("complete"):
        raise FileNotFoundError(
            f"snapshot {platform}/{day} absent du manifeste ou incomplet")

    compressed = _day_path(platform, day, root).read_bytes()
    payload = zstd.ZstdDecompressor().decompress(compressed)
    rows = {}
    row_count = 0
    for line in payload.decode().splitlines():
        if line:
            row = json.loads(line)
            rows[row["puuid"]] = row
            row_count += 1
    expected = manifest[day].get("n_rows")
    if expected is not None and row_count != expected:
        raise ValueError(
            f"snapshot {platform}/{day} corrompu: {row_count} lignes, "
            f"{expected} attendues")
    return rows


def main() -> int:
    platform = cli.arg("--platform", "euw1")
    day = cli.arg("--day", dt.date.today().isoformat())
    regional = rl.PLATFORM_TO_REGIONAL.get(platform, "europe")
    client = rl.RiotClient(settings.riot_api_key(), regional, platform)
    captured_at_ms = int(dt.datetime.now(dt.UTC).timestamp() * 1000)
    rows = [{**row, "ts": captured_at_ms} for row in snapshot_rows(client)]
    write_snapshot(rows, platform, day, SNAPSHOT_ROOT)
    mark_complete(platform, day, SNAPSHOT_ROOT, len(rows), captured_at_ms)
    print(f"✓ snapshot {platform}/{day} : {len(rows)} joueurs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
