"""Le raw R2 est indexé PAR MATCH, jamais par joueur.

Ce n'est pas une préférence de nommage : build_dataset.py ré-extrait LES DEUX ADC
de chaque partie depuis le raw. Un stockage par joueur dupliquerait les parties
partagées par deux inscrits et fausserait le comptage du dataset.
"""
from __future__ import annotations

import storage


def test_la_cle_raw_ne_contient_pas_le_slug():
    key = storage.R2Storage.raw_key("euw1", "EUW1_7412345678", "match")
    assert key == "raw/euw1/EUW1_7412345678.json.zst"


def test_la_cle_timeline_est_distincte():
    assert storage.R2Storage.raw_key("euw1", "EUW1_7412345678", "timeline") == \
        "raw/euw1/EUW1_7412345678.timeline.json.zst"


def test_deux_joueurs_de_la_meme_partie_partagent_la_cle():
    a = storage.R2Storage.raw_key("euw1", "EUW1_7412345678", "match")
    b = storage.R2Storage.raw_key("euw1", "EUW1_7412345678", "match")
    assert a == b


def test_put_raw_envoie_la_cle_calculee(monkeypatch):
    sent = {}

    class _FakeClient:
        def put_object(self, Bucket, Key, Body):  # noqa: N803 (signature boto3)
            sent.update(bucket=Bucket, key=Key, body=Body)

    r2 = storage.R2Storage.__new__(storage.R2Storage)
    r2.bucket = "coaching-lol-raw"
    r2.client = _FakeClient()
    key = r2.put_raw("euw1", "EUW1_1", "match", b"payload")
    assert key == "raw/euw1/EUW1_1.json.zst"
    assert sent == {"bucket": "coaching-lol-raw", "key": key, "body": b"payload"}
