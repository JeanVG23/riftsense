"""Service d'ingestion Riot (Cloud Run).

Deux routes : une sonde publique et l'ingestion, protégée par un secret partagé
posé en en-tête par le Worker Cloudflare. Le secret partagé plutôt qu'un jeton
OIDC est un choix documenté (spec section 6) : livrer d'abord, comparer ensuite.

Ce module ne contient aucun métier : il route, garde, et traduit les exceptions
en codes stables. Le métier vit dans riot_ingest.py.
"""
from __future__ import annotations

import functools
import hmac
import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request

import riot_ingest
import role_scoring
from errors import error_code_of
from kv_client import KV
from storage import R2Storage

app = Flask(__name__)

SECRET_HEADER = "X-Ingest-Secret"


def require_secret(view):
    """Refuse la requête si l'en-tête ne porte pas le secret attendu.

    `compare_digest` compare en temps constant. Le refus quand `INGEST_SECRET`
    est vide n'est pas de la paranoïa : sans lui, un déploiement qui oublie le
    secret ouvrirait au monde la seule route qui consomme la clé Riot.
    """
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        expected = os.environ.get("INGEST_SECRET") or ""
        given = request.headers.get(SECRET_HEADER) or ""
        if not expected or not hmac.compare_digest(expected, given):
            return jsonify({"error_code": "unauthorized"}), 401
        return view(*args, **kwargs)
    return wrapper


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "riftsense-ingest"})


_REQUIRED = ("slug", "riot_id", "platform")


def _kv() -> KV:
    return KV(
        os.environ["CF_ACCOUNT_ID"],
        os.environ["CF_KV_NAMESPACE_ID"],
        os.environ["CF_API_TOKEN"],
    )


def _r2() -> R2Storage:
    return R2Storage(
        os.environ["R2_BUCKET"],
        os.environ["CF_ACCOUNT_ID"],
        os.environ["R2_ACCESS_KEY_ID"],
        os.environ["R2_SECRET_ACCESS_KEY"],
    )


_MODELS = None


def _models():
    """Charge les modèles une fois par processus du service."""
    global _MODELS
    if _MODELS is None:
        _MODELS = role_scoring.load_models(Path(os.environ.get(
            "MODEL_DIR", "/app/data/05_model")))
    return _MODELS


@app.post("/ingest")
@require_secret
def ingest():
    payload = request.get_json(silent=True) or {}
    missing = [field for field in _REQUIRED if not payload.get(field)]
    if missing:
        return jsonify({"error_code": "internal", "missing": missing}), 400
    try:
        client = riot_ingest.build_client(payload["platform"])
        with tempfile.TemporaryDirectory(prefix="ingest-") as tmp:
            result = riot_ingest.run(
                payload, client=client, kv=_kv(), r2=_r2(), data_dir=Path(tmp),
                models=_models())
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001 : traduit en code stable, journalisé entier
        code = error_code_of(exc)
        app.logger.exception("ingestion échouée pour %s", payload.get("slug"))
        status = 422 if code in ("riot_id_not_found", "no_ranked_games") else 503
        return jsonify({"status": "error", "error_code": code}), status
