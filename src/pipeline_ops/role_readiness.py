#!/usr/bin/env python3
"""Décide l'ouverture publique de chaque rôle à partir du held-out."""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))

import cli  # noqa: E402
import riotlib as rl  # noqa: E402
import role_features as rf  # noqa: E402

MODEL_DIR = rl.DATA / "05_model"
THRESHOLD = 0.70
DEFAULT_CORPUS = "research"
"""Seul `production` autorise l'ouverture : c'est une certification, pas un
état par défaut. Rien ne borne plus l'écart entre les parties agrégées et la
capture du rang (`label_age_days` le mesure sans le refuser) ; annoncer
production doit donc rester un geste écrit à la main."""


def _stderr(auc: float, n_players: int) -> float:
    """Approximation de Hanley-McNeil pour un échantillon équilibré."""
    n_pos = n_neg = max(n_players / 2, 1)
    q1 = auc / (2 - auc)
    q2 = 2 * auc**2 / (1 + auc)
    variance = (
        auc * (1 - auc)
        + (n_pos - 1) * (q1 - auc**2)
        + (n_neg - 1) * (q2 - auc**2)
    ) / (n_pos * n_neg)
    return max(variance, 0.0) ** 0.5


def readiness(metrics: dict, *, threshold: float = THRESHOLD,
              corpus: str = DEFAULT_CORPUS) -> dict:
    """Résume la marge prudente ; un corpus research ne peut jamais ouvrir.

    La marge se lit sur la MÉDIANE des tirages du held-out, jamais sur un
    tirage. Mesuré le 2026-09-18 : à 28 joueurs de held-out, le même modèle sur
    les mêmes données rend 0.663 ou 0.918 selon les personnes tirées, et la
    certification passait cinq fois sur dix.

    Le bruit retranché est la PLUS GRANDE des deux estimations disponibles,
    l'approximation paramétrique et la dispersion réellement observée. Ce n'est
    pas un double comptage : les deux mesurent le même bruit d'échantillonnage
    par deux chemins, et à faible effectif chacune peut sous-estimer l'autre.
    """
    auc = float(metrics["auc_heldout_median"]["ebm"])
    draws = [float(row["ebm"]) for row in metrics["auc_heldout_seeds"]]
    if not draws:
        raise KeyError("auc_heldout_seeds vide")
    n_players = int(metrics["n_players"])
    parametric = _stderr(auc, n_players)
    observed = statistics.pstdev(draws) if len(draws) > 1 else 0.0
    stderr = max(parametric, observed)
    margin = auc - stderr - threshold
    passed = sum(1 for draw in draws
                 if draw - _stderr(draw, n_players) - threshold > 0)
    return {
        "role": rf.normalize_role(metrics["role"]),
        # Reporté tel quel : le service refuse une image où l'export embarqué
        # et la marge publiée ne viennent pas du même entraînement.
        "model_id": metrics["model_id"],
        "auc_ebm": round(auc, 4),
        "n_seeds": len(draws),
        "stderr": round(stderr, 4),
        "stderr_parametric": round(parametric, 4),
        "stderr_observed": round(observed, 4),
        # Diagnostic, pas un critère : dit à quelle fréquence la décision
        # aurait basculé si l'on s'était contenté d'un tirage.
        "pass_rate": round(passed / len(draws), 2),
        "margin": round(margin, 4),
        "corpus": corpus,
        # None, jamais zéro : zéro affirmerait un label contemporain des parties.
        "label_age_days": (metrics.get("dataset") or {}).get(
            "label_age_days", {}).get("max"),
        "open": bool(margin > 0 and corpus == "production"),
    }


def main() -> int:
    threshold = float(cli.arg("--threshold", THRESHOLD))
    corpus = cli.arg("--corpus", DEFAULT_CORPUS)
    rows = []
    for role in rf.ROLES:
        # Aucun repli sur `utility_player_metrics.json` : ces métriques ne sont
        # plus régénérables et les servir sous le nom SUPPORT publierait l'AUC
        # d'un modèle pour celle d'un autre.
        path = MODEL_DIR / f"{role.lower()}_player_metrics.json"
        if not path.exists():
            print(f"  ⚠ {role} : métriques absentes ({path.name})")
            continue
        # Des métriques d'avant le held-out répété n'ont pas de médiane.
        # Prendre leur `auc_heldout` pour une servirait un tirage unique sous
        # le nom d'une statistique robuste : on saute le rôle et on le dit.
        try:
            rows.append(readiness(json.loads(path.read_text()),
                                  threshold=threshold, corpus=corpus))
        except KeyError:
            print(f"  ⚠ {role} : métriques d'un seul tirage, relancer "
                  f"train_role_ensemble.py --role {role.lower()}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    (MODEL_DIR / "role_readiness.json").write_text(json.dumps(rows, indent=2))
    print(f"{'rôle':<9}{'AUC méd.':>9}{'bruit':>8}{'marge':>9}"
          f"{'tirages>0':>11}{'âge label':>11}  ouverture")
    for row in sorted(rows, key=lambda item: -item["margin"]):
        age = row["label_age_days"]
        print(f"{row['role']:<9}{row['auc_ebm']:>9.4f}"
              f"{row['stderr']:>8.4f}{row['margin']:>9.4f}"
              f"{f'{row['pass_rate']:.0%} de {row['n_seeds']}':>11}"
              f"{'?' if age is None else f'{age} j':>11}  "
              f"{'oui' if row['open'] else 'non'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
