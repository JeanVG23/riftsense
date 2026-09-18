"""Décision d'ouverture publique, rôle par rôle."""
import importlib.util
import json
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "rr", Path("src/pipeline_ops/role_readiness.py"))
rr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rr)


def _metrics(auc, n_players, role="TOP"):
    return {"role": role, "auc": {"ebm": 0.99},
            "auc_heldout": {"ebm": auc}, "n_players": n_players}


def test_readiness_lit_le_heldout_pas_la_cv():
    out = rr.readiness(_metrics(0.60, 2000), threshold=0.70,
                       corpus="production")
    assert out["auc_ebm"] == 0.60
    assert out["open"] is False


def test_marge_confortable_ouvre():
    out = rr.readiness(_metrics(0.79, 610), threshold=0.70,
                       corpus="production")
    assert out["open"] is True
    assert out["margin"] > 0


def test_marge_inferieure_a_l_erreur_type_n_ouvre_pas():
    out = rr.readiness(_metrics(0.7096, 442), threshold=0.70,
                       corpus="production")
    assert out["open"] is False


def test_corpus_research_n_ouvre_jamais():
    out = rr.readiness(_metrics(0.85, 610), threshold=0.70,
                       corpus="research")
    assert out["open"] is False
    assert out["corpus"] == "research"


def test_erreur_type_decroit_avec_l_effectif():
    petit = rr.readiness(_metrics(0.75, 200), threshold=0.70,
                         corpus="production")
    grand = rr.readiness(_metrics(0.75, 2000), threshold=0.70,
                         corpus="production")
    assert petit["stderr"] > grand["stderr"]


def test_readiness_renomme_l_ancien_role_utility_en_support():
    out = rr.readiness(_metrics(0.75, 200, role="UTILITY"))
    assert out["role"] == "SUPPORT"


def test_le_corpus_par_defaut_ne_se_certifie_pas_production():
    """Ouvrir un rôle au public est un acte explicite, jamais un défaut.

    `corpus="production"` CERTIFIE que les labels viennent du corpus servi.
    Le prendre par défaut revient à signer cette certification sans que
    personne ne l'ait écrite.
    """
    out = rr.readiness(_metrics(0.85, 610), threshold=0.70)
    assert out["corpus"] == "research"
    assert out["open"] is False


def test_une_regeneration_sans_argument_n_ouvre_aucun_role(tmp_path,
                                                           monkeypatch):
    """Régénérer la table ne doit pas suffire à ouvrir un rôle au public."""
    monkeypatch.setattr(rr, "MODEL_DIR", tmp_path)
    (tmp_path / "bottom_player_metrics.json").write_text(
        json.dumps(_metrics(0.85, 610, role="BOTTOM")))
    monkeypatch.setattr(sys, "argv", ["role_readiness.py"])

    assert rr.main() == 0

    rows = json.loads((tmp_path / "role_readiness.json").read_text())
    assert [row["open"] for row in rows] == [False]


def test_la_table_d_ouverture_porte_l_age_du_label():
    """Décider d'ouvrir un rôle sans voir l'âge du label, c'est décider à l'aveugle.

    La borne des 14 jours a été retirée (elle suivait le rythme des patchs, pas
    la donnée) : plus rien ne refuse un rang relevé des mois après les parties.
    Le chiffre doit donc être sous les yeux de qui signe la certification.
    """
    metrics = _metrics(0.85, 610)
    metrics["dataset"] = {"label_age_days": {"min": 73, "p50": 79, "max": 85}}
    assert rr.readiness(metrics)["label_age_days"] == 85


def test_un_age_de_label_inconnu_ne_s_invente_pas():
    """Un dataset sans sidecar rend None, jamais zéro : zéro dirait « contemporain »."""
    assert rr.readiness(_metrics(0.85, 610))["label_age_days"] is None


def test_aucun_repli_sur_les_anciennes_metriques_utility(tmp_path, monkeypatch):
    """Servir `utility_player_metrics.json` pour SUPPORT, c'est publier l'AUC
    d'un modèle qui ne peut plus être régénéré, sous le nom d'un autre.

    Le repli est légitime pour un DATASET (retrouver une entrée sous son ancien
    nom est bénin) ; il ne l'est pas pour des métriques, qui sont le chiffre sur
    lequel se décide l'ouverture au public.
    """
    monkeypatch.setattr(rr, "MODEL_DIR", tmp_path)
    (tmp_path / "utility_player_metrics.json").write_text(
        json.dumps(_metrics(0.99, 900, role="UTILITY")))
    monkeypatch.setattr(sys, "argv", ["role_readiness.py"])

    assert rr.main() == 0

    rows = json.loads((tmp_path / "role_readiness.json").read_text())
    assert rows == []
