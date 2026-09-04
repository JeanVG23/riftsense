"""Parité de la métrique d'éval entre la CLI Python et le Worker TypeScript.

Le taux d'utilité est calculé deux fois : par `feedback.py summary` (local, sert
la page CV) et par `web/cf/src/evaluation.ts` (le site, qui doit compter aussi
les annotations laissées depuis le web). Deux runtimes, donc deux implémentations,
mais un seuil déclaré à deux endroits dérive en silence : publier « cible 70 % »
d'un côté et mesurer 60 % de l'autre invaliderait le chiffre affiché.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))
sys.path.insert(0, str(ROOT / "src" / "04_coaching"))

import feedback as fb  # noqa: E402

EVAL_TS = ROOT / "web" / "cf" / "src" / "evaluation.ts"


def _ts_const(name: str) -> float:
    m = re.search(rf"export const {name} = ([\d.]+);", EVAL_TS.read_text())
    assert m, f"{name} introuvable dans {EVAL_TS}"
    return float(m.group(1))


def test_objective_thresholds_match():
    assert _ts_const("TARGET_N") == fb._OBJECTIVE_N
    assert _ts_const("TARGET_RATE") == fb._OBJECTIVE_RATE


def test_both_report_the_same_shape():
    """Le frontend lit une seule forme de rapport, quelle que soit sa source."""
    ts = EVAL_TS.read_text()
    for field in ("n_game_reviews", "objective", "target_met", "global_rate",
                  "by_kind", "top_tags", "n_reviews_annotated", "n_items",
                  "by_prompt_version"):
        assert f"{field}" in ts, field
    report = fb.eval_report("nobody", root=ROOT / "tests" / "nonexistent")
    assert set(report) >= {"n_game_reviews", "objective", "target_met",
                           "global_rate", "by_kind", "top_tags",
                           "n_reviews_annotated", "n_items",
                           "by_prompt_version"}


_COHORT_KEYS = {"n_game_reviews_annotated", "mistake_useful_rate",
                "n_items", "global_rate"}


def test_by_prompt_version_nested_keys_match(tmp_path):
    """`by_prompt_version` n'est pas qu'un nom de champ : la FORME de chaque
    cohorte (les 4 clés imbriquées) est le contrat entre les deux runtimes.
    Un renommage d'une seule clé imbriquée d'un côté doit faire échouer ce test."""
    ts = EVAL_TS.read_text()
    for key in _COHORT_KEYS:
        # \b : un renommage en `<key>_suffix` ne doit pas passer pour une présence
        # de `<key>` (sous-chaîne trompeuse, cf. constat de revue).
        assert re.search(rf"\b{key}\b", ts), key

    root = tmp_path / "07_coaching"
    (root / "p").mkdir(parents=True)
    review = {"ts": "t1", "kind": "game", "match_id": "EUW1_1",
              "model": "kimi-k2.6", "run": {"prompt_version": "abc123"}}
    (root / "p" / "reviews.jsonl").write_text(
        json.dumps(review, ensure_ascii=False) + "\n")
    feedback = {"ts": "t1", "player": "p", "model": "kimi-k2.6",
                "rated_at": "2026-09-04T12:00:00",
                "items": [{"kind": "mistake", "index": 0, "useful": True,
                          "tag": None, "note": None}]}
    (root / "p" / "feedback.jsonl").write_text(
        json.dumps(feedback, ensure_ascii=False) + "\n")

    report = fb.eval_report("p", root=root)
    cohorts = report["by_prompt_version"]
    assert "abc123" in cohorts
    assert set(cohorts["abc123"]) == _COHORT_KEYS
