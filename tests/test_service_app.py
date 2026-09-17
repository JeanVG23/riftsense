"""Service d'ingestion : sonde publique et garde du secret partagé.

Le secret est comparé en temps constant, et un service déployé SANS secret
configuré refuse tout : une variable d'environnement oubliée ne doit pas
ouvrir la route qui consomme la clé Riot.
"""
from __future__ import annotations

import pytest

import app as service_app
import errors


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("INGEST_SECRET", "s3cr3t")
    service_app.app.config.update(TESTING=True)
    return service_app.app.test_client()


def test_health_est_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_ingest_refuse_sans_entete(client):
    assert client.post("/ingest", json={}).status_code == 401


def test_ingest_refuse_un_mauvais_secret(client):
    response = client.post("/ingest", json={}, headers={"X-Ingest-Secret": "faux"})
    assert response.status_code == 401


def test_ingest_refuse_un_corps_incomplet(client):
    response = client.post("/ingest", json={"slug": "x"},
                           headers={"X-Ingest-Secret": "s3cr3t"})
    assert response.status_code == 400
    assert response.get_json()["error_code"] == "internal"


def test_ingest_traduit_une_erreur_typee_en_code_stable(client, monkeypatch):
    """Le contrat central de la route : le TYPE de l'exception decide le code et
    le statut HTTP, jamais le texte du message."""
    def _raise(platform):
        raise errors.RiotIdNotFound("Inconnu#euw")

    monkeypatch.setattr(service_app.riot_ingest, "build_client", _raise)
    response = client.post(
        "/ingest",
        json={"slug": "x", "riot_id": "Inconnu#euw", "platform": "euw1"},
        headers={"X-Ingest-Secret": "s3cr3t"},
    )
    assert response.status_code == 422
    assert response.get_json()["error_code"] == "riot_id_not_found"


def test_ingest_rabat_une_exception_inconnue_sans_fuiter_son_message(client, monkeypatch):
    """Une exception non prevue devient `internal`/503, et son message (qui
    pourrait porter un detail interne) ne doit jamais atteindre la reponse."""
    def _raise(platform):
        raise ValueError("secret-ish")

    monkeypatch.setattr(service_app.riot_ingest, "build_client", _raise)
    response = client.post(
        "/ingest",
        json={"slug": "x", "riot_id": "Y#euw", "platform": "euw1"},
        headers={"X-Ingest-Secret": "s3cr3t"},
    )
    assert response.status_code == 503
    assert response.get_json()["error_code"] == "internal"
    assert "secret-ish" not in response.get_data(as_text=True)


def test_ingest_refuse_quand_le_secret_nest_pas_configure(monkeypatch):
    monkeypatch.delenv("INGEST_SECRET", raising=False)
    client = service_app.app.test_client()
    response = client.post("/ingest", json={}, headers={"X-Ingest-Secret": ""})
    assert response.status_code == 401
