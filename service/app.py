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

from flask import Flask, jsonify, request

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
    return jsonify({"status": "ok", "service": "coaching-lol-ingest"})


@app.post("/ingest")
@require_secret
def ingest():
    return jsonify({"status": "stub"})
