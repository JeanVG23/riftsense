"""Certification d'un rôle : où elle vit, et ce qui l'annule.

`role_readiness.json` est RÉÉCRIT en entier à chaque `make roles`. Une
certification posée à la main dedans disparaît au premier réentraînement, sans
bruit et sans trace. Elle vit donc dans `config/role_corpus.json`, versionné.

Le point qui donne sa valeur au mécanisme : la certification porte le
`model_id` du modèle certifié. Un réentraînement change le `model_id`, donc
PÉRIME la certification et referme le rôle. Certifier ne peut pas ouvrir un
modèle que personne n'a regardé.
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "rr_corpus", Path("src/pipeline_ops/role_readiness.py"))
rr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rr)

MODEL_ID = "a1b2c3d4e5f60718"


def _metrics(auc, n_players, role="BOTTOM", seeds=6, model_id=MODEL_ID):
    values = [auc] * seeds
    return {"role": role, "auc": {"ebm": 0.99},
            "auc_heldout_median": {"ebm": statistics.median(values)},
            "auc_heldout_seeds": [{"seed": i, "ebm": v}
                                  for i, v in enumerate(values)],
            "n_players": n_players, "model_id": model_id}


def _certifie(tmp_path, entries) -> Path:
    path = tmp_path / "role_corpus.json"
    path.write_text(json.dumps(entries))
    return path


# --- le résolveur -----------------------------------------------------------

def test_un_role_absent_du_fichier_reste_research():
    """Le défaut n'est pas « ouvert » : c'est l'absence de certification."""
    table = {"JUNGLE": {"corpus": "production", "model_id": MODEL_ID}}
    assert rr.resolve_corpus("BOTTOM", MODEL_ID, table) == "research"


def test_une_certification_valide_rend_production():
    table = {"BOTTOM": {"corpus": "production", "model_id": MODEL_ID}}
    assert rr.resolve_corpus("BOTTOM", MODEL_ID, table) == "production"


def test_un_model_id_different_annule_la_certification():
    """Le cœur du mécanisme : un réentraînement referme le rôle tout seul.

    Sans cette règle, la certification VOYAGERAIT vers le modèle suivant et
    ouvrirait au public des chiffres que personne n'a lus.
    """
    table = {"BOTTOM": {"corpus": "production", "model_id": "0000000000000000"}}
    assert rr.resolve_corpus("BOTTOM", MODEL_ID, table) == "research"


def test_une_certification_sans_model_id_est_refusee():
    """Une certification qui ne dit pas ce qu'elle certifie ne certifie rien."""
    table = {"BOTTOM": {"corpus": "production"}}
    assert rr.resolve_corpus("BOTTOM", MODEL_ID, table) == "research"


def test_un_corpus_inconnu_reste_research():
    """Toute valeur autre que `production` est lue comme non certifiée."""
    table = {"BOTTOM": {"corpus": "prod", "model_id": MODEL_ID}}
    assert rr.resolve_corpus("BOTTOM", MODEL_ID, table) == "research"


# --- le chargement ----------------------------------------------------------

def test_le_chargement_normalise_la_cle_du_role(tmp_path):
    """`UTILITY` est l'ancien nom de SUPPORT : les deux désignent le même rôle.

    La normalisation est faite AU CHARGEMENT, une fois, et `resolve_corpus`
    reçoit une table déjà normalisée. Sans elle, une certification écrite sous
    l'ancien nom serait lue comme l'absence de certification, donc
    silencieusement ignorée.
    """
    path = _certifie(tmp_path, {
        "UTILITY": {"corpus": "production", "model_id": MODEL_ID}})

    table = rr.load_corpus_table(path)

    assert rr.resolve_corpus("SUPPORT", MODEL_ID, table) == "production"


def test_un_fichier_de_certification_absent_rend_une_table_vide(tmp_path):
    """Un clone frais n'a pas à porter le fichier pour que `make roles` tourne."""
    assert rr.load_corpus_table(tmp_path / "absent.json") == {}


def test_un_fichier_illisible_rend_une_table_vide(tmp_path):
    """Un JSON cassé ferme les rôles, il ne fait pas tomber la régénération."""
    path = tmp_path / "role_corpus.json"
    path.write_text("{ cassé")
    assert rr.load_corpus_table(path) == {}


# --- bout en bout, par `main()` ---------------------------------------------

def _run(tmp_path, monkeypatch, metrics, argv=None):
    monkeypatch.setattr(rr, "MODEL_DIR", tmp_path)
    (tmp_path / "bottom_player_metrics.json").write_text(json.dumps(metrics))
    monkeypatch.setattr(sys, "argv", ["role_readiness.py"] + (argv or []))
    assert rr.main() == 0
    return json.loads((tmp_path / "role_readiness.json").read_text())


def test_une_certification_valide_ouvre_le_role(tmp_path, monkeypatch):
    monkeypatch.setattr(rr, "CORPUS_FILE", _certifie(tmp_path, {
        "BOTTOM": {"corpus": "production", "certified_on": "2026-09-20",
                   "model_id": MODEL_ID}}))

    rows = _run(tmp_path, monkeypatch, _metrics(0.85, 610))

    assert [(row["corpus"], row["open"]) for row in rows] == [("production", True)]


def test_un_reentrainement_referme_le_role_certifie(tmp_path, monkeypatch):
    """Mêmes chiffres, `model_id` neuf : la table se referme d'elle-même."""
    monkeypatch.setattr(rr, "CORPUS_FILE", _certifie(tmp_path, {
        "BOTTOM": {"corpus": "production", "model_id": MODEL_ID}}))

    rows = _run(tmp_path, monkeypatch,
                _metrics(0.85, 610, model_id="feedfacecafebabe"))

    assert [(row["corpus"], row["open"]) for row in rows] == [("research", False)]


def test_une_marge_negative_ne_s_ouvre_pas_meme_certifiee(tmp_path, monkeypatch):
    """La certification est nécessaire, jamais suffisante : la marge décide aussi."""
    monkeypatch.setattr(rr, "CORPUS_FILE", _certifie(tmp_path, {
        "BOTTOM": {"corpus": "production", "model_id": MODEL_ID}}))

    rows = _run(tmp_path, monkeypatch, _metrics(0.7096, 442))

    assert [(row["corpus"], row["open"]) for row in rows] == [("production", False)]


def test_le_drapeau_corpus_ne_certifie_plus_rien(tmp_path, monkeypatch):
    """`--corpus production` était une certification sans trace ni destinataire.

    Le laisser vivre à côté du fichier ferait deux sources de vérité, dont une
    qui n'apparaît dans aucun diff.
    """
    monkeypatch.setattr(rr, "CORPUS_FILE", tmp_path / "absent.json")

    rows = _run(tmp_path, monkeypatch, _metrics(0.85, 610),
                argv=["--corpus", "production"])

    assert [(row["corpus"], row["open"]) for row in rows] == [("research", False)]
