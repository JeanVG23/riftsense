"""Tests de la collecte launchd des comptes curés, sans réseau."""
from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

ROOT = Path(__file__).resolve().parents[1]
for module_path in (
    ROOT / "src" / "core",
    ROOT / "src" / "collection",
    ROOT / "src" / "04_coaching",
):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

import refresh_curated_daily as daily  # noqa: E402


ACCOUNTS = [
    {"slug": "one", "riot_id": "One#EUW", "region": "euw1"},
    {"slug": "two", "riot_id": "Two#EUW", "region": "euw1"},
]


def test_previous_day_uses_paris_calendar():
    now = datetime(2026, 9, 20, 0, 30, tzinfo=ZoneInfo("Europe/Paris"))
    assert daily.previous_day(now) == date(2026, 9, 19)


@pytest.mark.parametrize(
    ("day", "duration"),
    [(date(2026, 3, 29), 23 * 3600), (date(2026, 10, 25), 25 * 3600)],
)
def test_day_window_handles_daylight_saving_time(day, duration):
    start, end = daily.day_window(day)
    assert end - start == duration


def test_run_fetches_only_config_accounts_and_publishes_only_changes(monkeypatch):
    fetches: list[tuple[str, dict]] = []
    syncs: list[list[str]] = []
    monkeypatch.setattr(daily.refresh_cloudflare, "ensure_cloudflare_configured", lambda: None)
    monkeypatch.setattr(daily.sync_cloudflare, "load_accounts", lambda: ACCOUNTS)

    def fake_fetch(account, **kwargs):
        fetches.append((account["slug"], kwargs))
        return {
            "n_games": 10,
            "n_new_games": 1 if account["slug"] == "one" else 0,
            "player": account["slug"],
        }

    monkeypatch.setattr(daily.pipeline, "fetch_games", fake_fetch)
    monkeypatch.setattr(daily.sync_cloudflare, "main", lambda args: syncs.append(args))

    daily.run(date(2026, 9, 19))

    assert [slug for slug, _ in fetches] == ["one", "two"]
    assert syncs == [["--slug", "one", "--skip-ref"]]
    assert all(kwargs["n"] == 100 for _, kwargs in fetches)
    assert all(kwargs["only_new"] is True for _, kwargs in fetches)
    assert all(kwargs["allow_empty"] is True for _, kwargs in fetches)
    start, end = daily.day_window(date(2026, 9, 19))
    assert all(kwargs["start_time"] == start for _, kwargs in fetches)
    assert all(kwargs["end_time"] == end for _, kwargs in fetches)


def test_one_failure_does_not_prevent_other_accounts(monkeypatch):
    called: list[str] = []
    monkeypatch.setattr(daily.refresh_cloudflare, "ensure_cloudflare_configured", lambda: None)
    monkeypatch.setattr(daily.sync_cloudflare, "load_accounts", lambda: ACCOUNTS)
    monkeypatch.setattr(daily.sync_cloudflare, "main", lambda args: called.append(args[1]))

    def fake_fetch(account, **kwargs):
        del kwargs
        if account["slug"] == "one":
            raise RuntimeError("Riot indisponible")
        return {"n_games": 4, "n_new_games": 1, "player": "two"}

    monkeypatch.setattr(daily.pipeline, "fetch_games", fake_fetch)

    with pytest.raises(RuntimeError, match="one: Riot indisponible"):
        daily.run(date(2026, 9, 19))

    assert called == ["two"]
