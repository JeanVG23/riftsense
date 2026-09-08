"""Service d'ingestion : sonde publique et garde du secret partagé.

Le secret est comparé en temps constant, et un service déployé SANS secret
configuré refuse tout : une variable d'environnement oubliée ne doit pas
ouvrir la route qui consomme la clé Riot.
"""
from __future__ import annotations

import pytest

import app as service_app


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


def test_ingest_refuse_quand_le_secret_nest_pas_configure(monkeypatch):
    monkeypatch.delenv("INGEST_SECRET", raising=False)
    client = service_app.app.test_client()
    response = client.post("/ingest", json={}, headers={"X-Ingest-Secret": ""})
    assert response.status_code == 401
