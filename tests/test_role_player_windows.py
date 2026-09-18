"""Fenêtre joueur (puuid, role, as_of) à N fixe.

Deux invariants : aucune partie postérieure à as_of n'entre dans la fenêtre, et
toutes les fenêtres contiennent exactement N parties. Le second n'est pas cosmétique :
les apex du référentiel ont été ciblés avec un historique plus profond que les
masters (médiane 49 contre 29 parties en MIDDLE), et cette profondeur fuit dans les
std/p10/p90 même quand la colonne n_games est retirée.
"""
import datetime as dt
import importlib.util
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

SPEC = importlib.util.spec_from_file_location(
    "brpd", Path("src/01_data_engineering/build_role_player_dataset.py"))
brpd = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(brpd)

DAY_MS = 86_400_000
AS_OF = 1_800_000_000_000


def _games(puuid, n, first_ts, step_ms=DAY_MS):
    return pd.DataFrame([
        {"puuid": puuid, "role": "JUNGLE", "match_id": f"{puuid}-{i}",
         "game_ts": first_ts + i * step_ms, "win": i % 2, "csm10": float(i),
         "n_deaths": float(i)}
        for i in range(n)])


def _snapshot(puuid, tier="MASTER"):
    return {puuid: {"puuid": puuid, "tier": tier, "division": "I", "lp": 50,
                    "wins": 100, "losses": 90}}


def test_fenetre_exactement_n_parties():
    games = _games("a", 40, AS_OF - 60 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert len(out) == 1
    assert out.iloc[0]["n_window"] == 20


def test_aucune_partie_posterieure_a_as_of():
    """Les parties après as_of doivent être exclues, pas juste triées."""
    past = _games("a", 20, AS_OF - 40 * DAY_MS)
    future = _games("a", 5, AS_OF + DAY_MS)
    # Les deux appels à _games recommencent leur index à zéro ; garder des IDs
    # uniques permet de vérifier la date de chaque partie sans sélection ambiguë.
    future["match_id"] = "future-" + future["match_id"]
    games = pd.concat([past, future])
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    used = brpd.window_match_ids(games, "a", n_window=20, as_of_ms=AS_OF)
    assert len(out) == 1
    assert all(games.set_index("match_id").loc[m, "game_ts"] <= AS_OF for m in used)


def test_joueur_sous_le_seuil_exclu():
    games = _games("a", 19, AS_OF - 30 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert out.empty


def test_joueur_absent_du_snapshot_exclu():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    out = brpd.build_windows(games, {}, "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert out.empty


def test_pas_de_colonne_n_games():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert "n_games" not in out.columns


def test_high_elo_depuis_le_tier_du_snapshot():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    for tier, expected in (("CHALLENGER", 1), ("GRANDMASTER", 1),
                           ("MASTER", 0), ("DIAMOND", 0)):
        out = brpd.build_windows(games, _snapshot("a", tier), "JUNGLE",
                                 n_window=20, as_of_ms=AS_OF)
        assert out.iloc[0]["high_elo"] == expected


def test_features_limitees_au_manifeste_du_role():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert any(c.startswith("csm10__") for c in out.columns)
    assert not any(c.startswith("support_deaths_early__") for c in out.columns)


def test_mid_agrege_les_diffs_de_lane_deja_extraits():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    games["role"] = "MIDDLE"
    games["gd10"] = range(25)
    games["gd14"] = range(100, 125)
    games["csd10"] = range(200, 225)
    games["csd14"] = range(300, 325)
    games["xpd10"] = range(400, 425)

    out = brpd.build_windows(games, _snapshot("a"), "MIDDLE", n_window=20,
                             as_of_ms=AS_OF)

    # Les 20 parties les plus récentes sont les indices 5..24.
    assert out.iloc[0]["gd10__mean"] == 14.5
    assert out.iloc[0]["gd14__p50"] == 114.5
    assert out.iloc[0]["csd10__mean"] == 214.5
    assert out.iloc[0]["csd14__p50"] == 314.5
    assert out.iloc[0]["xpd10__mean"] == 414.5


def test_n_window_ne_descend_pas_sous_le_plancher_d_eligibilite():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    with pytest.raises(ValueError, match="MIN_PLAYER_GAMES"):
        brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=14,
                           as_of_ms=AS_OF)


def test_ancien_dataset_utility_devient_support():
    games = _games("a", 25, AS_OF - 30 * DAY_MS)
    games["role"] = "UTILITY"
    out = brpd.build_windows(games, _snapshot("a"), "SUPPORT", n_window=20,
                             as_of_ms=AS_OF)
    assert len(out) == 1
    assert out.iloc[0]["role"] == "SUPPORT"


def test_un_label_ancien_n_est_plus_rejete():
    """La borne d'âge venait du rythme des patchs (14 jours), pas de la donnée.

    Elle est retirée : entre deux patchs la méta bouge peu, et la tenir imposait
    de recollecter tout le corpus à chaque snapshot. Une fenêtre reste donc
    valide quelle que soit la distance à la capture du ladder.
    """
    games = _games("a", 25, AS_OF - 200 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    assert len(out) == 1


def test_l_age_du_label_est_mesure_et_conserve():
    """Ne plus refuser le décalage oblige à le rendre lisible.

    Sans cette colonne, rien sur le disque ne dit que le rang attribué à une
    fenêtre a été relevé des mois après la dernière partie agrégée.
    """
    games = _games("a", 25, AS_OF - 200 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    # 25 parties espacées d'un jour : la plus récente est 176 jours avant as_of.
    assert out.iloc[0]["label_age_days"] == 176


def test_un_resultat_vide_n_ecrase_pas_un_dataset_existant(tmp_path, monkeypatch):
    """Publier zéro ligne par-dessus des heures de collecte, en sortant en succès.

    C'est arrivé : un snapshot qui ne recouvre aucun joueur rend une table vide,
    et `to_parquet` l'écrit sans rien demander. Effacer un dataset doit rester un
    geste explicite (supprimer le fichier), jamais l'effet de bord d'un rebuild.
    """
    monkeypatch.setattr(brpd, "DATASET_DIR", tmp_path)
    _games("a", 25, AS_OF - 30 * DAY_MS).to_parquet(
        tmp_path / "jungle_dataset.parquet", index=False)
    existing = tmp_path / "jungle_player_dataset.parquet"
    pd.DataFrame([{"puuid": "a", "high_elo": 1}]).to_parquet(existing, index=False)
    before = existing.read_bytes()
    monkeypatch.setattr(brpd.fetch_ladder, "load_snapshot", lambda *a, **k: {})
    monkeypatch.setattr(sys, "argv", ["build_role_player_dataset.py",
                                      "--role", "JUNGLE",
                                      "--snapshot-day", "2026-09-17"])

    assert brpd.main() != 0
    assert existing.read_bytes() == before


def test_la_fenetre_porte_son_empan_temporel():
    """Vingt parties étalées sur quatre mois et vingt parties en huit jours ne
    décrivent pas le même joueur. L'empan doit voyager avec la ligne, sinon la
    provenance se reconstruit à la main et se perd."""
    games = _games("a", 25, AS_OF - 200 * DAY_MS)
    out = brpd.build_windows(games, _snapshot("a"), "JUNGLE", n_window=20,
                             as_of_ms=AS_OF)
    # Les 20 dernières des 25 parties : indices 5 à 24.
    assert out.iloc[0]["game_ts_oldest"] == AS_OF - 195 * DAY_MS
    assert out.iloc[0]["game_ts_newest"] == AS_OF - 176 * DAY_MS


def _as_of_of(day: str) -> int:
    return int(dt.datetime.fromisoformat(day).replace(
        tzinfo=dt.UTC).timestamp() * 1000)


def test_le_dataset_ecrit_sa_provenance(tmp_path, monkeypatch):
    """Le parquet seul ne dit pas à quelle distance le rang a été relevé.

    Il stocke `as_of` sans dire de quand datent les parties, ni sous quelle
    profondeur de fenêtre il a été bâti. C'est ce silence qui a permis à un
    décalage de 73 jours entre parties et label de passer inaperçu.
    """
    day = "2026-09-17"
    as_of = _as_of_of(day)
    monkeypatch.setattr(brpd, "DATASET_DIR", tmp_path)
    _games("a", 25, as_of - 60 * DAY_MS).to_parquet(
        tmp_path / "jungle_dataset.parquet", index=False)
    monkeypatch.setattr(brpd.fetch_ladder, "load_snapshot",
                        lambda *a, **k: _snapshot("a"))
    monkeypatch.setattr(sys, "argv", ["build_role_player_dataset.py",
                                      "--role", "JUNGLE",
                                      "--snapshot-day", day])

    assert brpd.main() == 0

    meta = json.loads(
        (tmp_path / "jungle_player_dataset.meta.json").read_text())
    assert meta["role"] == "JUNGLE"
    assert meta["snapshot_day"] == day
    assert meta["n_window"] == 20
    assert meta["n_rows"] == 1
    assert meta["n_by_tier"] == {"MASTER": 1}
    # 25 parties d'un jour d'écart démarrées 60 jours avant la capture : la plus
    # récente tombe 36 jours avant elle.
    assert meta["label_age_days"]["max"] == 36
    assert meta["game_ts_newest"] == as_of - 36 * DAY_MS
