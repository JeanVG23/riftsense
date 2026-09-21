#!/usr/bin/env python3
"""Collecte puis publie les parties de la veille pour les comptes curés.

La source des comptes est exclusivement ``config/accounts.json`` : les comptes
publics inscrits depuis le navigateur, qui vivent dans le registre KV, ne sont
jamais parcourus par cette commande.

Sans argument, la journée visée est la veille civile en Europe/Paris. ``--day``
permet de rejouer explicitement une journée après un incident.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
for module_path in (
    ROOT / "src" / "core",
    ROOT / "src" / "collection",
    ROOT / "src" / "04_coaching",
):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

import pipeline  # noqa: E402
import refresh_cloudflare  # noqa: E402
import sync_cloudflare  # noqa: E402

PARIS = ZoneInfo("Europe/Paris")
MAX_DAILY_GAMES = 100


def previous_day(now: datetime | None = None) -> date:
    current = now.astimezone(PARIS) if now is not None else datetime.now(PARIS)
    return current.date() - timedelta(days=1)


def day_window(day: date) -> tuple[int, int]:
    """Bornes epoch de la journée parisienne, sûres aux changements d'heure."""
    start = datetime.combine(day, time.min, tzinfo=PARIS)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=PARIS)
    return int(start.timestamp()), int(end.timestamp())


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--day",
        type=date.fromisoformat,
        help="journée Europe/Paris à collecter (AAAA-MM-JJ ; défaut : veille)",
    )
    return parser


def run(day: date) -> None:
    refresh_cloudflare.ensure_cloudflare_configured()
    accounts = sync_cloudflare.load_accounts()
    start_time, end_time = day_window(day)
    print(
        f"== Collecte quotidienne des comptes curés : {day.isoformat()} "
        f"(Europe/Paris, {len(accounts)} comptes) ==",
        flush=True,
    )

    failures: list[str] = []
    published = 0
    for account in accounts:
        slug = account["slug"]
        print(f"\n-- {slug} --", flush=True)
        try:
            result = pipeline.fetch_games(
                account,
                n=MAX_DAILY_GAMES,
                start_time=start_time,
                end_time=end_time,
                only_new=True,
                allow_empty=True,
                on_progress=lambda message, slug=slug: print(
                    f"  [{slug}] {message}", flush=True
                ),
            )
            n_new = result["n_new_games"]
            print(f"  {n_new} nouvelle(s) partie(s)", flush=True)
            if n_new:
                sync_cloudflare.main(["--slug", slug, "--skip-ref"])
                published += n_new
        except (Exception, SystemExit) as exc:  # un compte en panne ne bloque pas les autres
            failures.append(f"{slug}: {exc}")
            print(f"  ✗ {failures[-1]}", file=sys.stderr, flush=True)

    print(f"\nOK : {published} nouvelle(s) partie(s) publiée(s).", flush=True)
    if failures:
        raise RuntimeError(
            f"{len(failures)} compte(s) en échec : " + "; ".join(failures)
        )


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    run(args.day or previous_day())


if __name__ == "__main__":
    main()
