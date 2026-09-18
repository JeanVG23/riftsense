"""Une coupure réseau passagère ne doit pas jeter une collecte de vingt minutes.

Le snapshot du ladder accumule ~1000 pages en mémoire avant d'écrire quoi que
ce soit : un seul `ReadTimeout` au milieu du parcours faisait tout perdre, alors
que la même requête relancée aboutit.
"""
import pytest
import requests

import riotlib as rl


class FakeResponse:
    status_code = 200
    headers: dict = {}

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FlakySession:
    """Expire `failures` fois, puis répond."""

    def __init__(self, failures: int, payload=None):
        self.failures = failures
        self.payload = payload if payload is not None else {"ok": True}
        self.calls = 0
        self.headers: dict = {}

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        if self.calls <= self.failures:
            raise requests.exceptions.ReadTimeout("read timed out")
        return FakeResponse(self.payload)


def _client(session, monkeypatch):
    monkeypatch.setattr(rl.time, "sleep", lambda _seconds: None)
    client = rl.RiotClient("cle-de-test", "europe", "euw1", min_interval=0)
    client.session = session
    return client


def test_un_timeout_passager_est_retente(monkeypatch):
    session = FlakySession(failures=1, payload={"entries": []})
    client = _client(session, monkeypatch)

    assert client._get("euw1", "/lol/league-exp/v4/entries") == {"entries": []}
    assert session.calls == 2


def test_une_panne_durable_finit_par_echouer_sans_boucler(monkeypatch):
    """Le budget de tentatives reste celui des autres erreurs : pas d'infini."""
    session = FlakySession(failures=99)
    client = _client(session, monkeypatch)

    with pytest.raises(RuntimeError):
        client._get("euw1", "/lol/league-exp/v4/entries")
    assert session.calls == 6


def test_l_erreur_reseau_reste_visible_dans_la_cause(monkeypatch):
    """Sans la cause, le log ne dit plus si Riot a refusé ou si le lien a lâché."""
    session = FlakySession(failures=99)
    client = _client(session, monkeypatch)

    with pytest.raises(RuntimeError) as failure:
        client._get("euw1", "/lol/league-exp/v4/entries")
    assert isinstance(failure.value.__cause__, requests.exceptions.RequestException)
