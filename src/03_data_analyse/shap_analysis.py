#!/usr/bin/env python3
"""
03_data_analyse : analyse EBM-primary (glass-box) + cross-check SHAP-sur-arbres,
unifiée sur deux niveaux (registre core/ebm_explain.py : player, game).

INVERSION DE RÔLE (cf. décision EBM) : l'EBM (GA²M) est la SOURCE PRIMAIRE
d'explication, pas un simple validateur. Justification mesurée : en CV out-of-fold
honnête (groupage puuid), AUC(ebm) ≈ AUC(ensemble) : l'EBM ne sacrifie aucun pouvoir
prédictif ET son explication est EXACTE par construction (ses shape functions SONT le
modèle), là où le SHAP-sur-arbres est une attribution post-hoc qui se dégrade sous
features corrélées (et les nôtres le sont : blocs csm/gpm/xppm, frac_behind/ahead,
familles deaths_*). Le nom du fichier reste shap_analysis.py : il exécute réellement
le cross-check SHAP comme validateur.

Deux niveaux, aux rôles explicites (cf. core/ebm_explain.py) :
  player : LE modèle servi (features agrégées per-player). Explication du placement.
    Les drivers per-player d'un joueur précis sont calculés par le sync
    (ml_rank.player_aggregate) : ce CLI n'explique que la population.
  game   : modèle d'explication du jeu-type (dia_chall), re-entraîné dans le DAG,
    JAMAIS servi pour le rang. Interactions par paires + drivers Spadzze (rows
    per-game de adc_dataset).

Enveloppe fine : la logique d'analyse vit dans core/ebm_explain.py (bibliothèque
pure, aussi consommée par le sync) ; ce CLI orchestre, écrit les artefacts, dessine.

Sorties (par niveau, sous data/06_shap/<out_dir de la config>) :
  - ebm_shape_functions.json : LE livrable prescriptif. Par feature : direction, seuil
    de bascule (valeur où le score log-odds croise 0), amplitude d'effet, monotonie.
    Robuste : résumé restreint au cœur des données [p5, p95] (les bins extrêmes
    low-density de l'EBM sont bruités).
  - ebm_ranking.json : importance globale des main effects (ranking primaire).
  - ebm_interactions.json : top interactions par paires (niveau game uniquement).
  - crosscheck_tree_vs_ebm.json : SHAP moyen (xgb+rf) vs contributions EBM par
    feature (Spearman + accord de signe) : le SHAP valide l'EBM, pas l'inverse.
  - spadzze_ebm_drivers.json : drivers EBM des games de Spadzze (niveau game uniquement).
  - shap_bar.png / shap_beeswarm.png : visuels SHAP-sur-arbres (cross-check).
  - diagnostics.json : auto-diagnostic LOWESS sur contributions EBM.

Usage : poetry run python3 src/03_data_analyse/shap_analysis.py [--level player|game]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import riotlib as rl
import shap
import plotter
import ebm_explain as ee


def _dump(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2))


def run_level(level: str) -> int:
    bundle = ee.load_level(level)
    cfg, models = bundle["config"], bundle["models"]
    features = bundle["features"]
    ebm = models["ebm"]
    neg, pos = cfg["names"]

    xref = bundle["df"][features]
    out = rl.DATA / cfg["out_dir"]
    out.mkdir(parents=True, exist_ok=True)
    print(f"\n  niveau='{level}' (neg={neg} / pos={pos}) | {len(xref)} rows | "
          f"{len(features)} features")

    # ============================================================ PRIMARY : EBM
    eg = ebm.explain_global().data()
    term_names, term_scores = list(eg["names"]), [float(s) for s in eg["scores"]]
    main_imp = {n: s for n, s in zip(term_names, term_scores) if " & " not in n}

    # --- ranking primaire (importance des main effects) ---
    ranking = sorted(((f, main_imp.get(f, 0.0)) for f in features), key=lambda t: -t[1])
    print("\n  ⭐ EBM main effects : importance globale (ranking primaire, top 15)")
    for f, v in ranking[:15]:
        print(f"    {f:<34} {v:.3f}")
    _dump(out / "ebm_ranking.json",
          [{"feature": f, "importance": round(v, 4)} for f, v in ranking])

    # --- shape functions : LE livrable prescriptif (tri par amplitude) ---
    shapes = {}
    for f in features:
        ti = ee.term_index(ebm, f)
        if ti is not None:
            shapes[f] = ee.shape_summary(ebm, ti, xref[f], neg, pos)
    by_swing = sorted(shapes.items(), key=lambda kv: -kv[1]["swing_logodds"])
    print("\n  📐 EBM shape functions (prescriptif, trié par amplitude d'effet) :")
    print(f"    {'feature':<34} {'swing':>6} {'mono':>5} {'seuil':>9}  sens")
    for f, s in by_swing:
        seuil = "-" if s["crossover_value"] is None else f"{s['crossover_value']:.2f}"
        print(f"    {f:<34} {s['swing_logodds']:>6.2f} {s['monotonic_rho']:>+5.2f} "
              f"{seuil:>9}  {s['direction']}")
    _dump(out / "ebm_shape_functions.json", dict(by_swing))

    # --- interactions par paires (la structure que l'additif pur ne voit pas) ---
    if cfg["interactions"]:
        interactions = sorted(((n, s) for n, s in zip(term_names, term_scores)
                              if " & " in n), key=lambda t: -t[1])
        print("\n  🔗 EBM : top interactions par paires")
        inter_rows = []
        for name, score in interactions[:10]:
            print(f"    {name:<44} {score:.3f}")
            inter_rows.append({"pair": name, "score": round(score, 4)})
        _dump(out / "ebm_interactions.json", inter_rows)

    # contributions EBM par sample (cross-check + diagnostics)
    ebm_ref = ee.term_contributions(ebm, xref, features)

    # ====================================================== CROSS-CHECK : SHAP arbres
    # Le SHAP moyen (xgb+rf) VALIDE l'EBM (rôle inversé). Au niveau player, xgb+rf
    # sont les DEUX modèles servis : ce cross-check légitime les drivers EBM publiés
    # par le sync alors que le rang vient de l'ensemble.
    cross, sv_vals = ee.crosscheck(models, xref, features, ebm_ref)
    print("\n  📈 Cross-check SHAP-arbres vs EBM (top 15, complet dans le JSON) :")
    for c in cross[:15]:
        flag = "✓" if c["spearman"] > 0.3 else ("⚠" if c["spearman"] < -0.2 else "·")
        print(f"    {flag} {c['feature']:<34} rho={c['spearman']:+.2f}  "
              f"sign_agree={c['sign_agree']:.0%}")
    n_ok = sum(1 for c in cross if c["spearman"] > 0.3)
    print(f"    → {n_ok}/{len(cross)} features en accord direction (rho>0.3)")
    _dump(out / "crosscheck_tree_vs_ebm.json", cross)

    sv_ensemble = shap.Explanation(values=sv_vals, data=xref.values,
                                   feature_names=features)
    n_display = min(25, len(features))    # 125 barres (player) = illisible
    plt.figure()
    shap.plots.bar(sv_ensemble, max_display=n_display, show=False)
    plt.tight_layout(); plt.savefig(out / "shap_bar.png", dpi=130); plt.close()
    plt.figure()
    shap.plots.beeswarm(sv_ensemble, max_display=n_display, show=False)
    plt.tight_layout(); plt.savefig(out / "shap_beeswarm.png", dpi=130); plt.close()

    # ============================================================ Spadzze via EBM
    # Niveau game uniquement : les drivers Spadzze sont des rows per-game de
    # adc_dataset. Au niveau player, ses drivers viennent du sync (agrégat de ses
    # games silver), pas de ce CLI.
    if level == "game":
        spad = bundle["df_all"]
        spad = spad[spad["source"].str.startswith("personal:spadzze", na=False)]
        if len(spad):
            contrib = ee.term_contributions(ebm, spad[features], features)
            mean_signed = contrib.mean(axis=0)
            drivers = sorted(zip(features, mean_signed), key=lambda t: t[1])
            print(f"\n  🎯 Drivers EBM : Spadzze ({len(spad)} games)")
            for f, v in drivers:
                print(f"    {f:<34} {v:+.3f}  {'→ ' + neg if v < 0 else '→ ' + pos}")
            _dump(out / "spadzze_ebm_drivers.json",
                  [{"feature": f, "mean_ebm_contrib": round(float(v), 4)}
                   for f, v in drivers])

    # ============================================================ diagnostics LOWESS
    print("\n  🔍 Auto-diagnostic (LOWESS) sur contributions EBM (top 15) :")
    diagnostics = plotter.generate_lol_diagnostics(xref, ebm_ref, features)
    for d in diagnostics[:15]:
        print(f"    {d['feature']:<34} | {d['diagnostic']}")
    _dump(out / "diagnostics.json", diagnostics)

    print(f"\n✓ Analyse EBM-primary ({level}) écrite dans {out}/")
    return 0


def main(levels: list[str]) -> int:
    for level in levels:
        run_level(level)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", choices=list(ee.LEVELS), default=None,
                    help="niveau à analyser (défaut : les deux, player puis game)")
    args = ap.parse_args()
    sys.exit(main([args.level] if args.level else list(ee.LEVELS)))