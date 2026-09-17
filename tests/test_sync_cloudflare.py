"""Tests du sync KV : dossiers temporaires, fake KV, zéro réseau."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for module_path in (
    ROOT / "src" / "core",
    ROOT / "src" / "collection",
):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

import kv_client  # noqa: E402
import ml_rank  # noqa: E402
import riotlib as rl  # noqa: E402
import sync_cloudflare as sc  # noqa: E402


class FakeKV(sc.KV):
    def __init__(self):
        super().__init__("account", "namespace", "token")
        self.store: dict[str, str] = {}

    def put(self, key: str, value: str) -> None:
        self.puts.append(key)
        self.store[key] = value

    def get(self, key: str) -> str | None:
        return self.store.get(key)


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    monkeypatch.setattr(rl, "DATA", tmp_path)
    return tmp_path


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def test_sync_account_pushes_keys(data_root, monkeypatch):
    _write(
        data_root / "02_silver" / "personal" / "p" / "games.jsonl",
        json.dumps({"match_id": "EUW1_10", "role": "BOTTOM"}) + "\n",
    )
    _write(
        data_root / "02_silver" / "personal" / "p" / "rank.json",
        json.dumps({"tier": "MASTER"}),
    )
    _write(
        data_root / "03_gold" / "personal" / "p" / "all" / "aggregate.json",
        json.dumps({"n_games": 10}),
    )
    _write(
        data_root / "03_gold" / "personal" / "p" / "adc" / "aggregate.json",
        json.dumps({"n_games": 8}),
    )
    monkeypatch.setattr(
        ml_rank,
        "predict_rank",
        lambda games: {"predicted_rank": "master", "proba": 0.6, "n_games_used": 20},
    )
    monkeypatch.setattr(ml_rank, "player_aggregate",
                        lambda games: ({"gd10": 80.0}, 20))
    import ebm_explain  # noqa: E402  (src/core est déjà sur sys.path via conftest)
    monkeypatch.setattr(
        ebm_explain, "load_level",
        lambda level: {"models": {"ebm": object()}, "features": ["gd10", "dpm"]})
    monkeypatch.setattr(
        ebm_explain, "explain_player_row",
        lambda ebm, agg, features: [
            {"feature": "gd10", "contribution": -0.4},
            {"feature": "dpm", "contribution": 0.2},
        ])

    kv = FakeKV()
    sc.sync_account(kv, "p")

    assert kv.store["silver:p:games"] == (
        data_root / "02_silver" / "personal" / "p" / "games.jsonl"
    ).read_text()
    assert json.loads(kv.store["silver:p:rank"]) == {"tier": "MASTER"}
    assert json.loads(kv.store["gold:p:all"]) == {"n_games": 10}
    assert json.loads(kv.store["gold:p:adc"]) == {"n_games": 8}
    assert json.loads(kv.store["pred:p"])["predicted_rank"] == "master"
    assert json.loads(kv.store["shap:p:drivers"]) == [
        {"feature": "gd10", "contribution": -0.4},
        {"feature": "dpm", "contribution": 0.2},
    ]
    assert "riftsense:p:reviews" not in kv.store
    assert "riftsense:p:feedback" not in kv.store
    bundle = json.loads(kv.store["riftsense:p:game-payloads"])
    assert bundle["items"] == {}
    assert bundle["unavailable"] == [
        {"match_id": "EUW1_10", "reason": "benchmark_missing"}
    ]


def test_sync_account_slices_last_20_games(data_root, monkeypatch):
    seen: list[int] = []

    def fake_predict(games):
        seen.append(len(games))
        return None

    monkeypatch.setattr(ml_rank, "predict_rank", fake_predict)
    games = data_root / "02_silver" / "personal" / "p" / "games.jsonl"
    games.parent.mkdir(parents=True, exist_ok=True)
    games.write_text("\n".join(json.dumps({"match_id": f"EUW1_{i}"}) for i in range(30)) + "\n")

    kv = FakeKV()
    sc.sync_account(kv, "p")
    assert seen == [20]
    assert "pred:p" not in kv.store
    assert "shap:p:drivers" not in kv.store   # pas de prediction => pas de drivers


def test_sync_account_can_skip_game_payload_bundle(data_root, monkeypatch):
    monkeypatch.setattr(ml_rank, "predict_rank", lambda games: None)
    _write(data_root / "02_silver" / "personal" / "p" / "games.jsonl",
           json.dumps({"match_id": "EUW1_1"}) + "\n")
    kv = FakeKV()
    sc.sync_account(kv, "p", game_payloads=False)
    assert "riftsense:p:game-payloads" not in kv.store


def test_seed_reviews_only_when_kv_key_absent(data_root, monkeypatch):
    monkeypatch.setattr(ml_rank, "predict_rank", lambda games: None)
    _write(
        data_root / "07_coaching" / "p" / "reviews.jsonl",
        json.dumps({"ts": "t1"}) + "\n",
    )
    kv = FakeKV()
    sc.sync_account(kv, "p", seed_reviews=True)
    assert kv.store.get("riftsense:p:reviews") == (
        data_root / "07_coaching" / "p" / "reviews.jsonl"
    ).read_text()

    kv2 = FakeKV()
    kv2.store["riftsense:p:reviews"] = json.dumps({"ts": "web"}) + "\n"
    sc.sync_account(kv2, "p", seed_reviews=True)
    assert json.loads(kv2.store["riftsense:p:reviews"])["ts"] == "web"


def test_sync_referential(data_root):
    _write(
        data_root / "03_gold" / "referentiel" / "challenger" / "adc" / "aggregate.json",
        json.dumps({"n_games": 100}),
    )
    kv = FakeKV()
    sc.sync_referential(kv)
    assert json.loads(kv.store["ref:challenger:adc"]) == {"n_games": 100}


def test_dry_kv_never_calls_network(monkeypatch):
    monkeypatch.setattr(kv_client.requests, "put", lambda *args, **kwargs: pytest.fail("network PUT"))
    monkeypatch.setattr(kv_client.requests, "get", lambda *args, **kwargs: pytest.fail("network GET"))
    kv = sc.DryKV()
    kv.put("key", "value")
    assert kv.get("key") is None
    assert kv.puts == ["key"]


def test_merge_jsonl_keeps_remote_and_overwrites_by_ts():
    """Reviews et feedbacks arrivent des deux cotes (site + CLI) : une ligne
    distante absente en local doit survivre, une ligne commune est reprise du
    local (plus recent au moment du sync)."""
    remote = "\n".join([
        json.dumps({"ts": "t1", "src": "web"}),
        json.dumps({"ts": "t2", "src": "web"}),
    ]) + "\n"
    merged = sc.merge_jsonl(remote, [{"ts": "t2", "src": "cli"},
                                     {"ts": "t3", "src": "cli"}])
    rows = [json.loads(line) for line in merged.splitlines()]
    assert [r["ts"] for r in rows] == ["t1", "t2", "t3"]     # ordre distant preserve
    assert rows[0]["src"] == "web"                           # web-only conserve
    assert rows[1]["src"] == "cli"                           # local gagne sur t2


def test_push_coaching_merges_reviews_and_feedback(data_root, monkeypatch):
    monkeypatch.setattr(ml_rank, "predict_rank", lambda games: None)
    _write(data_root / "07_coaching" / "p" / "reviews.jsonl",
           json.dumps({"ts": "t2", "kind": "game"}) + "\n")
    _write(data_root / "07_coaching" / "p" / "feedback.jsonl",
           json.dumps({"ts": "t2", "items": []}) + "\n")
    kv = FakeKV()
    kv.store["riftsense:p:reviews"] = json.dumps({"ts": "t1", "kind": "game"}) + "\n"
    sc.sync_account(kv, "p", coaching=True)
    reviews = [json.loads(l) for l in kv.store["riftsense:p:reviews"].splitlines()]
    assert [r["ts"] for r in reviews] == ["t1", "t2"]        # la review web survit
    assert json.loads(kv.store["riftsense:p:feedback"])["ts"] == "t2"


def test_ebm_drivers_excludes_ml_only_proxies(monkeypatch):
    """Garde-fou asymetrie cote publication : les 3 proxys de vision ML_ONLY
    nourrissent le modele mais ne doivent JAMAIS apparaitre dans l'onglet lu par
    le joueur (pendant de l'assert de compare.py sur POS_ROWS). Ici ils dominent
    en amplitude : sans le filtre ils occuperaient le top."""
    import ebm_explain  # noqa: E402
    contribs = [
        {"feature": "pos_overext_x_unaccounted__p10", "contribution": 0.9},
        {"feature": "pos_frac_deaths_in_fog__mean", "contribution": -0.8},
        {"feature": "pos_avg_unaccounted_enemies__p50", "contribution": 0.7},
        {"feature": "pos_max_map_depth__p10", "contribution": 0.2},
        {"feature": "csm14__p10", "contribution": -0.1},
    ]
    monkeypatch.setattr(ebm_explain, "load_level",
                        lambda level: {"models": {"ebm": object()},
                                       "features": [c["feature"] for c in contribs]})
    monkeypatch.setattr(ebm_explain, "explain_player_row",
                        lambda ebm, agg, features: contribs)

    drivers = sc._ebm_drivers(({"gd10": 1.0}, 20), n=20)

    assert [d["feature"] for d in drivers] == ["pos_max_map_depth__p10", "csm14__p10"]
    assert not any(sc._is_ml_only(d["feature"]) for d in drivers)


def test_ebm_drivers_degrades_when_ml_artifacts_are_missing(monkeypatch):
    """load_level charge 3 pkl ET un parquet : un seul absent ne doit pas abattre
    le sync du compte (games/gold/reviews partent quand meme)."""
    import ebm_explain  # noqa: E402

    def boom(level):
        raise FileNotFoundError("data/05_model/ebm_player_highelo.pkl")

    monkeypatch.setattr(ebm_explain, "load_level", boom)
    assert sc._ebm_drivers(({"gd10": 1.0}, 20)) is None


def test_sync_account_publishes_pred_even_without_ml_artifacts(data_root, monkeypatch):
    import ebm_explain  # noqa: E402
    _write(data_root / "02_silver" / "personal" / "p" / "games.jsonl",
           json.dumps({"match_id": "EUW1_1"}) + "\n")
    monkeypatch.setattr(ml_rank, "predict_rank",
                        lambda games: {"predicted_rank": "master", "proba": 0.6})
    monkeypatch.setattr(ml_rank, "player_aggregate", lambda games: ({"gd10": 1.0}, 20))
    monkeypatch.setattr(ebm_explain, "load_level",
                        lambda level: (_ for _ in ()).throw(FileNotFoundError("pkl")))

    kv = FakeKV()
    sc.sync_account(kv, "p", game_payloads=False)

    assert json.loads(kv.store["pred:p"])["predicted_rank"] == "master"
    assert "shap:p:drivers" not in kv.store
