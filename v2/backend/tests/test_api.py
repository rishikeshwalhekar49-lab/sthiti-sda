"""Route behaviour, offline: archive downloads and live NSE/BSE reads are stubbed."""
import asyncio
import json

import httpx
import pytest

from sthiti import app as appmod
from sthiti import eod, live, llm


async def _no_archive(_path):
    return None


LIVE = {"value": {"open": False, "status": "Close", "tradeDate": "", "message": "", "sourceSaysOpen": False, "nifty": None},
        "at": 0, "error": None, "stale": False}
INDICES = {"value": {"NIFTY 50": {"last": 22888.95, "pct": -1.11}, "NIFTY 500": {"advances": 131, "declines": 367},
                     "INDIA VIX": {"last": 15.2}}, "at": 0, "error": None, "stale": False}
FLOWS = {"value": {"fii": {"date": "19-Oct-2026", "net": -1148.64}, "dii": {"date": "19-Oct-2026", "net": 3201.19}},
         "at": 0, "error": None, "stale": False}


@pytest.fixture(scope="module")
def client():
    eod.archive = _no_archive
    mp = pytest.MonkeyPatch()

    async def const(v):
        return v

    mp.setattr(live, "market", lambda: const(LIVE))
    mp.setattr(live, "indices", lambda: const(INDICES))
    mp.setattr(live, "flows", lambda: const(FLOWS))
    asyncio.run(eod.ensure_data(lambda *_: None))
    yield httpx.AsyncClient(transport=httpx.ASGITransport(app=appmod.app), base_url="http://t")
    mp.undo()


def call(client, method, path, **kw):
    async def go():
        return await client.request(method, path, **kw)
    return asyncio.run(go())


def test_eod_payload(client):
    r = call(client, "GET", "/api/eod")
    assert r.status_code == 200
    d = r.json()
    assert len(d["dates"]) == 500 and len(d["sectors"]) >= 15 and d["calibration"]["chosen"] in (20, 30, 40, 60, 80, 100, 120)
    assert "NaN" not in r.text and "Infinity" not in r.text


def test_portfolio_validation(client):
    assert call(client, "POST", "/api/portfolio", json={"holdings": [{"sym": "TCS"}]}).json() == {"error": "Give at least two holdings."}
    many = {"holdings": [{"sym": f"S{i}"} for i in range(61)]}
    assert call(client, "POST", "/api/portfolio", json=many).json() == {"error": "Up to 60 holdings at a time."}
    bad = call(client, "POST", "/api/portfolio", content=b"{not json")
    assert bad.status_code == 500 and bad.json() == {"error": "invalid JSON body"}


def test_portfolio_report(client):
    body = {"holdings": [{"sym": "tcs", "weight": 2}, {"sym": "INFY", "weight": "x"}, {"sym": "HDFCBANK", "weight": 1}]}
    d = call(client, "POST", "/api/portfolio", json=body).json()
    assert d["symbols"] == ["TCS", "INFY", "HDFCBANK"]
    assert abs(sum(d["weights"]) - 1) < 1e-12 and d["weights"][0] == 0.5  # bad weight falls back to 1
    assert 1 <= d["effN"] <= 3


def test_episode_validation(client):
    assert call(client, "GET", "/api/episode?from=2020-1-1&to=2020-06-30").json() == {"error": "from and to must be YYYY-MM-DD"}


def test_surrogate_is_deterministic_and_cached(client):
    a = call(client, "GET", "/api/surrogate?win=60&n=50").json()
    b = call(client, "GET", "/api/surrogate?win=60&n=50").json()
    assert a == b and a["surrogates"] == 50 and a["verdict"] in ("real", "weak", "noise") and a["shift"]["values"]


def test_explain_without_model(client):
    d = call(client, "POST", "/api/explain", json={"question": "x" * 1000}).json()
    assert len(d["question"]) == 400 and d["llmAvailable"] is False and d["llm"] is None
    assert d["plain"].startswith("The engine reads **")


def test_unknown_api_route(client):
    r = call(client, "GET", "/api/nope")
    assert r.status_code == 404 and r.json() == {"error": "not found"}


# ---------- dispatcher ----------
class Fake:
    def __init__(self, name, ok=True, avail=True):
        self.name, self.model, self.ok, self.avail, self.calls = name, name + "-model", ok, avail, 0

    def available(self):
        return self.avail

    async def answer(self, system, user):
        self.calls += 1
        assert "Never invent a number" in system and '"regime": "calm"' in user
        if not self.ok:
            raise llm.ProviderError(f"{self.name}: down")
        return f"answer from {self.name}", self.model


def test_dispatcher_falls_back_in_order(monkeypatch):
    a, b, c = Fake("claude", ok=False), Fake("groq", avail=False), Fake("gemini")
    monkeypatch.setattr(llm, "PROVIDERS", {"claude": a, "groq": b, "gemini": c})
    monkeypatch.setenv("LLM_ORDER", "claude,groq,gemini")
    text, provider, model, errors = asyncio.run(llm.answer("why?", {"regime": "calm"}))
    assert (text, provider, model) == ("answer from gemini", "gemini", "gemini-model")
    assert errors == ["claude: down"] and b.calls == 0  # unconfigured providers are skipped


def test_dispatcher_all_fail(monkeypatch):
    monkeypatch.setattr(llm, "PROVIDERS", {"claude": Fake("claude", ok=False)})
    monkeypatch.setenv("LLM_ORDER", "claude")
    assert asyncio.run(llm.answer("why?", {"regime": "calm"})) == (None, None, None, ["claude: down"])


def test_no_keys_means_unavailable():
    assert llm.available() is False and llm.configured() == []
