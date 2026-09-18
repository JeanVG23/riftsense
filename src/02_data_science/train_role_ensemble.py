#!/usr/bin/env python3
"""Entraîne et évalue un modèle per-player distinct pour chaque rôle.

L'EBM destiné au public ne voit que les features publiables. Sa décomposition
reste ainsi exacte : aucune contribution cachée n'est retirée après coup.
"""
from __future__ import annotations

import json
import pickle
import sys
from collections import Counter
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent / "core"
sys.path.insert(0, str(CORE))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.model_selection import StratifiedKFold, train_test_split  # noqa: E402

import cli  # noqa: E402
import ml_features as mf  # noqa: E402
import riotlib as rl  # noqa: E402
import role_features as rf  # noqa: E402
from cv_common import SEED, make_models  # noqa: E402

DATASET_DIR = rl.DATA / "04_dataset"
MODEL_DIR = rl.DATA / "05_model"
_LOW_OF_BOUNDARY = {"master": {"MASTER"}, "diamond": {"DIAMOND"}}
_HIGH_TIERS = {"GRANDMASTER", "CHALLENGER"}


def dataset_provenance(player_path: Path) -> dict:
    """Sidecar de provenance écrit à côté du dataset, ou bloc vide.

    Les métriques sont relues seules, loin du parquet : sans ce report, l'âge du
    label resterait dans un fichier que personne n'ouvre au moment de décider
    l'ouverture publique.
    """
    meta = player_path.with_suffix(".meta.json")
    return json.loads(meta.read_text()) if meta.exists() else {}


def ebm_feature_columns(role: str) -> list[str]:
    """Colonnes agrégées publiables du rôle, plus le taux de victoire.

    `win_rate` n'est pas une statistique d'agrégat mais un scalaire de fenêtre.
    Il entre quand même : la fenêtre a une profondeur FIXE, donc il est
    strictement comparable d'un joueur à l'autre, et sans lui une série de
    défaites tire les agrégats de performance vers le profil low elo sans que le
    modèle puisse l'imputer à la variance de résultat. `n_games` reste dehors :
    c'est la profondeur d'historique collecté, donc un proxy du rang.
    """
    return [f"{feature}__{stat}"
            for feature in rf.public_features(role)
            for stat in mf.AGG_STATS] + ["win_rate"]


def driver_stability(fold_contribs: list[dict[str, float]]) -> dict[str, float]:
    """Fréquence du sens majoritaire de l'effet d'une feature, sur les folds.

    Un fold où le terme est plat (sens nul) ne vote pas pour désigner le sens
    majoritaire, mais il reste au dénominateur : un driver qui ne se prononce que
    la moitié du temps n'est pas stable.
    """
    names = sorted({name for fold in fold_contribs for name in fold})
    stability = {}
    for name in names:
        signs = [float(np.sign(fold[name])) for fold in fold_contribs
                 if name in fold]
        directed = [sign for sign in signs if sign != 0.0]
        if not signs:
            continue
        if not directed:
            stability[name] = 0.0
            continue
        majority = Counter(directed).most_common(1)[0][0]
        stability[name] = sum(sign == majority for sign in signs) / len(signs)
    return stability


def _balance(players: pd.DataFrame, low_tiers: set[str]) -> pd.DataFrame:
    high = players[players["tier"].isin(_HIGH_TIERS)]
    low = players[players["tier"].isin(low_tiers)]
    n_each = min(len(high), len(low))
    if n_each == 0:
        raise ValueError("les deux classes doivent contenir au moins un joueur")
    return pd.concat([
        high.sample(n_each, random_state=SEED),
        low.sample(n_each, random_state=SEED),
    ])


def split_holdout(players: pd.DataFrame, frac: float = 0.15
                  ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Sépare une fraction stratifiée de joueurs, jamais vue à l'entraînement."""
    if not 0 < frac < 1:
        raise ValueError("frac doit être strictement compris entre 0 et 1")
    # Un ndarray objet évite un bug d'indexation sklearn/pandas lorsque l'index
    # utilise le dtype Arrow par défaut de pandas 3.
    index = players.index.to_numpy(dtype=object)
    train_index, holdout_index = train_test_split(
        index,
        test_size=frac,
        random_state=SEED,
        stratify=players["high_elo"],
    )
    return players.loc[train_index], players.loc[holdout_index]


def _ebm_term_directions(model, X: pd.DataFrame) -> dict[str, float]:
    """Sens de la shape function de chaque terme EBM, mesuré sur un fold.

    `eval_terms` rend des contributions CENTRÉES : leur moyenne vaut zéro par
    construction, donc son signe ne mesure rien. Ce qui caractérise un driver,
    c'est le sens de son effet : on compare la contribution moyenne du décile
    haut de la feature à celle du décile bas.
    """
    terms = np.asarray(model.eval_terms(X), dtype=float)
    directions = {}
    for index, name in enumerate(model.term_names_):
        name = str(name)
        if name not in X.columns:
            continue
        values = X[name].to_numpy(dtype=float)
        low, high = np.nanpercentile(values, [10, 90])
        if not np.isfinite(low) or not np.isfinite(high) or high <= low:
            directions[name] = 0.0
            continue
        directions[name] = float(np.nanmean(terms[values >= high, index])
                                 - np.nanmean(terms[values <= low, index]))
    return directions


def _feature_matrix(frame: pd.DataFrame, columns: list[str],
                    index=None) -> pd.DataFrame:
    """Sous-matrice des features, sans jamais inventer de colonne ni de ligne.

    `reindex` fabrique des NaN pour tout ce qui manque et les imputer à zéro les
    rend indiscernables de vrais zéros : une feature absente du dataset
    deviendrait une feature plate, un joueur purgé un joueur moyen.
    `ml_features` pose l'invariant inverse (« NaN propagée [...], pas
    d'imputation ») : xgb, rf et l'EBM traitent nativement la valeur manquante.
    """
    missing = [name for name in columns if name not in frame.columns]
    if missing:
        raise KeyError(f"features absentes du dataset : {missing}")
    if index is not None:
        absent = [key for key in index if key not in frame.index]
        if absent:
            raise KeyError(f"{len(absent)} joueurs sans features agrégées")
        frame = frame.loc[index]
    return frame.loc[:, columns]


def purged_fixed_window_features(
        games: pd.DataFrame, train_players: pd.DataFrame,
        excluded_puuids, role: str) -> tuple[pd.DataFrame, list[str]]:
    """Reconstruit le train sans fuite, à la même profondeur que le serving.

    Les matchs partagés avec les joueurs exclus sont retirés, puis les N parties
    les plus récentes *antérieures au snapshot* sont reprises. Une partie plus
    ancienne peut donc remplacer un match purgé, mais ni la taille de la fenêtre ni
    la causalité temporelle ne changent.
    """
    role = rf.normalize_role(role)
    if "role" in games:
        normalized_roles = games["role"].map(rf.normalize_role)
        role_games = games[normalized_roles == role]
    else:
        role_games = games
    excluded_matches = set(role_games.loc[
        role_games["puuid"].isin(set(excluded_puuids)), "match_id"])
    features = rf.public_features(role)
    rows, dropped = [], []
    for puuid, player in train_players.iterrows():
        n_window = int(player["n_window"])
        as_of = int(player["as_of"])
        sub = role_games[
            (role_games["puuid"] == puuid)
            & (role_games["game_ts"] <= as_of)
            & ~role_games["match_id"].isin(excluded_matches)
        ].sort_values("game_ts", ascending=False).head(n_window)
        if len(sub) < n_window:
            dropped.append(puuid)
            continue
        record = {"puuid": puuid}
        aggregates = mf.aggregate_player_features(sub, features)
        aggregates.pop("n_games", None)
        record.update(aggregates)
        rows.append(record)
    return pd.DataFrame(rows), dropped


def _auc_by_model(y_true, probabilities: dict[str, np.ndarray]) -> dict[str, float]:
    result = {name: float(roc_auc_score(y_true, values))
              for name, values in probabilities.items()}
    result["ens_xgb_rf"] = float(roc_auc_score(
        y_true, np.mean([probabilities["xgb"], probabilities["rf"]], axis=0)))
    return result


def train_role(player_df: pd.DataFrame, games_df: pd.DataFrame, role: str, *,
               boundary: str = "master", n_splits: int = 5,
               holdout_frac: float = 0.15) -> dict:
    """Retourne les diagnostics CV et les métriques du test tenu à l'écart."""
    role = rf.normalize_role(role)
    if role not in rf.ROLES:
        raise ValueError(f"rôle inconnu : {role}")
    if boundary not in _LOW_OF_BOUNDARY:
        raise ValueError(f"frontière inconnue : {boundary}")

    balanced = _balance(player_df.set_index("puuid"),
                        _LOW_OF_BOUNDARY[boundary])
    players, holdout = split_holdout(balanced, holdout_frac)
    columns = ebm_feature_columns(role)
    puuids = players.index.to_numpy()
    y = players["high_elo"].to_numpy()
    oof = {name: np.full(len(puuids), np.nan)
           for name in ("xgb", "rf", "ebm")}
    fold_contribs: list[dict[str, float]] = []

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=SEED)
    for train_idx, val_idx in cv.split(puuids, y):
        train_puuids = list(puuids[train_idx])
        val_puuids = list(puuids[val_idx])
        X_train, dropped = purged_fixed_window_features(
            games_df, players.loc[train_puuids],
            [*val_puuids, *holdout.index], role)
        y_train = pd.Series(y[train_idx], index=train_puuids).drop(
            index=dropped, errors="ignore")
        X_train = _feature_matrix(X_train.set_index("puuid"), columns,
                                  index=y_train.index)
        X_val = _feature_matrix(players.loc[val_puuids], columns)
        for name, model in make_models().items():
            model.fit(X_train, y_train)
            oof[name][val_idx] = model.predict_proba(X_val)[:, 1]
            if name == "ebm":
                fold_contribs.append(_ebm_term_directions(model, X_val))

    auc = _auc_by_model(y, oof)

    # Le test final est purgé des matchs partagés avec ses joueurs.
    X_train, dropped = purged_fixed_window_features(
        games_df, players, list(holdout.index), role)
    y_train = pd.Series(y, index=puuids).drop(index=dropped, errors="ignore")
    X_train = _feature_matrix(X_train.set_index("puuid"), columns,
                              index=y_train.index)
    X_holdout = _feature_matrix(holdout, columns)
    y_holdout = holdout["high_elo"].to_numpy()
    heldout_probabilities = {}
    for name, model in make_models().items():
        model.fit(X_train, y_train)
        heldout_probabilities[name] = model.predict_proba(X_holdout)[:, 1]
    auc_heldout = _auc_by_model(y_holdout, heldout_probabilities)

    return {
        "role": role,
        "boundary": boundary,
        "n_players": int(len(holdout)),
        "n_players_train": int(len(players)),
        "n_window": (int(player_df["n_window"].iloc[0])
                     if len(player_df) else None),
        "auc": {name: round(value, 4) for name, value in auc.items()},
        "auc_heldout": {name: round(value, 4)
                        for name, value in auc_heldout.items()},
        "ebm_gap_vs_ensemble": round(
            auc_heldout["ebm"] - auc_heldout["ens_xgb_rf"], 4),
        "driver_stability": {
            name: round(value, 3)
            for name, value in driver_stability(fold_contribs).items()
        },
        "n_features": len(columns),
    }


def main() -> int:
    role = rf.normalize_role(cli.arg("--role", "BOTTOM"))
    boundary = cli.arg("--boundary", "master").lower()
    folds = cli.int_arg("--folds", 5)
    if role not in rf.ROLES:
        print(f"rôle inconnu : {role}", file=sys.stderr)
        return 2
    if boundary not in _LOW_OF_BOUNDARY:
        print(f"frontière inconnue : {boundary}", file=sys.stderr)
        return 2

    player_path = DATASET_DIR / f"{role.lower()}_player_dataset.parquet"
    games_path = DATASET_DIR / f"{role.lower()}_dataset.parquet"
    if role == "SUPPORT":
        legacy_player = DATASET_DIR / "utility_player_dataset.parquet"
        legacy_games = DATASET_DIR / "utility_dataset.parquet"
        if not player_path.exists() and legacy_player.exists():
            player_path = legacy_player
        if not games_path.exists() and legacy_games.exists():
            games_path = legacy_games
    player_df = pd.read_parquet(player_path)
    games_df = pd.read_parquet(games_path)
    metrics = train_role(player_df, games_df, role, boundary=boundary,
                         n_splits=folds)
    metrics["dataset"] = dataset_provenance(player_path)

    players = _balance(player_df.set_index("puuid"),
                       _LOW_OF_BOUNDARY[boundary])
    columns = ebm_feature_columns(role)
    ebm = make_models()["ebm"]
    ebm.fit(_feature_matrix(players, columns), players["high_elo"])
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with (MODEL_DIR / f"{role.lower()}_player_ebm.pkl").open("wb") as handle:
        pickle.dump({"model": ebm, "features": columns}, handle)
    (MODEL_DIR / f"{role.lower()}_player_metrics.json").write_text(
        json.dumps(metrics, indent=2))
    print(f"✓ {role} : EBM held-out {metrics['auc_heldout']['ebm']} "
          f"(CV {metrics['auc']['ebm']}) | ensemble held-out "
          f"{metrics['auc_heldout']['ens_xgb_rf']} | "
          f"n held-out={metrics['n_players']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
