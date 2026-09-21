"""Contrat du filtre temporel Match-V5."""
from __future__ import annotations

import riotlib as rl


def test_match_ids_sends_both_time_bounds(monkeypatch):
    client = rl.RiotClient("key", "europe", "euw1", min_interval=0)
    calls = []

    def fake_get(host, path, **params):
        calls.append((host, path, params))
        return ["EUW1_123"]

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.match_ids(
        "puuid", count=100, queue=rl.QUEUE_SOLO,
        start_time=1_790_000_000, end_time=1_790_086_400,
    )

    assert result == ["EUW1_123"]
    assert calls[0][2] == {
        "count": 100,
        "start": 0,
        "queue": rl.QUEUE_SOLO,
        "startTime": 1_790_000_000,
        "endTime": 1_790_086_400,
    }
