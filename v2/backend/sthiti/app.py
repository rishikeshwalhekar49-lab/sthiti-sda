"""Sthiti v2 API server (FastAPI). Port of server.js: same routes, same response shapes.

New in v2:
  GET /api/stream   Server-Sent Events: pushes the live payload (and quotes) when they change.
  /api/explain      answers through the multi-provider dispatcher in llm.py.
  The built React frontend (../frontend/dist) is served from /, installable as a PWA.

Run:  .venv/bin/uvicorn sthiti.app:app --port 8000 --timeout-keep-alive 65
"""
import asyncio
import json
import mimetypes
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from . import analytics as an
from . import eod, explain, live, llm
from . import patents as pat
from .jsnum import clean

mimetypes.add_type("application/manifest+json", ".webmanifest")   # not in every platform's table

DIST = Path(os.environ.get("STHITI_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
log = print


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def js(obj, status=200):
    """JSON with JavaScript's conventions: NaN/Infinity become null, never cached."""
    body = json.dumps(clean(obj), separators=(",", ":"), allow_nan=False).encode()
    return Response(body, status_code=status, media_type="application/json; charset=utf-8", headers={"Cache-Control": "no-store"})


async def read_body(request: Request, limit=200_000):
    raw = await request.body()
    if len(raw) > limit:
        raise ValueError("body too large")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        raise ValueError("invalid JSON body")


async def _refresh_loop():
    while True:
        await asyncio.sleep(2 * 3600)
        try:
            await eod.ensure_data(lambda *_: None)
        except Exception:
            pass


async def _startup():
    log("Downloading NSE end-of-day files (first run takes a minute or two)…")
    try:
        await live.market()
        await asyncio.gather(live.indices(), live.flows(), live.quotes(), live.option_chain())
        log("Live feeds connected (NSE indices, flows, option chain; BSE quotes).")
    except Exception:
        pass
    try:
        d = await eod.ensure_data(log)
        log(f"Ready. History to {d['asOf']}: {len(d['dates'])} trading days, {len(d['stocks'])} stocks, {len(d['scan'])} scanner hits.")
    except Exception as e:
        log(f"End-of-day build failed: {e}")


@asynccontextmanager
async def lifespan(_app):
    tasks = [asyncio.create_task(_startup()), asyncio.create_task(_refresh_loop())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Sthiti", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def errors_as_json(request: Request, call_next):
    t0 = time.time()
    try:
        res = await call_next(request)
    except Exception as e:  # every API failure is a JSON body, as in the original
        return js({"error": str(e) or type(e).__name__}, 500)
    ms = (time.time() - t0) * 1000
    if request.url.path.startswith("/api/") and request.url.path != "/api/stream" and ms > 2000:
        log(f"  slow: {request.url.path} took {ms / 1000:.1f}s")
    return res


async def live_payload():
    m, ix, fl = await asyncio.gather(live.market(), live.indices(), live.flows())
    return {"fetchedAt": now_iso(), "market": m["value"], "marketAt": m["at"], "indices": ix["value"], "indicesAt": ix["at"],
            "indicesStale": ix["stale"], "flows": fl["value"], "flowsAt": fl["at"],
            "errors": [e["error"] for e in (m, ix, fl) if e["error"]]}


@app.get("/api/live")
async def api_live():
    return js(await live_payload())


@app.get("/api/quotes")
async def api_quotes():
    q = await live.quotes()
    return js({"fetchedAt": now_iso(), **q})


def eod_options(data):
    fo = data and data.get("fo")
    if not fo:
        return None
    today = fo["tradeDate"]
    expiries = sorted(fo["expiries"])
    expiry = next((e for e in expiries if e > today), expiries[0] if expiries else None)
    if not expiry:
        return None
    by_strike = {}
    for r in fo["expiries"][expiry]:
        row = by_strike.setdefault(r["K"], {"K": r["K"], "ce": None, "pe": None})
        leg = {"ltp": r["ltp"], "iv": None, "oi": r["oi"], "chgOi": r["chgOi"], "vol": r["vol"]}
        if r["t"] == "CE":
            row["ce"] = leg
        elif r["t"] == "PE":
            row["pe"] = leg
    return {"source": "eod", "expiry": expiry, "timestamp": f"NSE F&O close, {fo['tradeDate']}", "und": fo["und"], "lot": fo["lot"],
            "strikes": sorted(by_strike.values(), key=lambda r: r["K"])}


@app.get("/api/options")
async def api_options():
    data = eod.state["data"]
    lot = data["fo"]["lot"] if data and data.get("fo") else None
    chain = await live.option_chain()
    v = chain.get("value")
    if v and v.get("strikes"):
        return js({**v, "lot": lot, "at": chain["at"], "stale": chain.get("stale"), "error": chain.get("error")})
    fallback = eod_options(data)
    if fallback:
        return js({**fallback, "error": chain.get("error") or "live chain unavailable"})
    return js({"error": chain.get("error") or "no option data", "strikes": []})


@app.get("/api/eod")
async def api_eod():
    try:
        data = await eod.ensure_data(log)
    except Exception:
        data = None
    if not data:
        s = eod.state
        return js({"building": True, "done": s["done"], "total": s["total"], "error": s["error"]}, 202)
    return Response(eod.state["json"], media_type="application/json; charset=utf-8", headers={"Cache-Control": "no-store"})


@app.post("/api/portfolio")
async def api_portfolio(request: Request):
    body = await read_body(request)
    if not eod.state["data"]:
        return js({"error": "End-of-day data is still loading."})
    holdings = []
    for h in body.get("holdings") or []:
        sym = str(h.get("sym") or "").strip().upper()
        try:
            w = float(h.get("weight"))
        except (TypeError, ValueError):
            w = 0
        if sym:
            holdings.append({"sym": sym, "weight": w if w > 0 else 1})
    if len(holdings) < 2:
        return js({"error": "Give at least two holdings."})
    if len(holdings) > 60:
        return js({"error": "Up to 60 holdings at a time."})
    return js(an.portfolio_report(holdings, eod.state["rets"], eod.state["meta"]))


ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@app.get("/api/episode")
async def api_episode(request: Request):
    f, t = request.query_params.get("from") or "", request.query_params.get("to") or ""
    if not ISO.match(f) or not ISO.match(t):
        return js({"error": "from and to must be YYYY-MM-DD"})
    return js(await eod.index_range(f, t, log))


@app.api_route("/api/explain", methods=["GET", "POST"])
async def api_explain(request: Request):
    body = await read_body(request) if request.method == "POST" else {}
    data = eod.state["data"]
    if not data:
        return js({"error": "End-of-day data is still loading."})
    m, ix, fl = await asyncio.gather(live.market(), live.indices(), live.flows())
    x = explain.facts(data, {"market": m["value"], "indices": ix["value"], "flows": fl["value"]})
    question = str(body.get("question") or "What is the market regime right now, and what changed?")[:400]
    out = {"question": question, "facts": x, "plain": explain.plain_answer(x), "llmAvailable": llm.available(),
           "llm": None, "llmError": None, "llmProvider": None, "llmModel": None, "llmProviders": llm.configured()}
    if out["llmAvailable"]:
        text, provider, model, errors = await llm.answer(question, x)
        out.update(llm=text, llmProvider=provider, llmModel=model, llmError="; ".join(errors) or None)
    return js(out)


_surrogate_cache: dict = {}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


@app.get("/api/surrogate")
async def api_surrogate(request: Request):
    data = eod.state["data"]
    if not data:
        return js({"error": "End-of-day data is still loading."})
    q = request.query_params
    win = max(20, min(180, _int(q.get("win")) or (data["calibration"]["chosen"] if data.get("calibration") else 60)))
    n = max(50, min(500, _int(q.get("n")) or 200))
    end = _int(q.get("end"))
    key = f"sur:{win}:{n}:{end if end is not None else 'last'}:{data['asOf']}"
    if key in _surrogate_cache:
        return js(_surrogate_cache[key])
    t0 = time.time()

    def run():
        out = pat.surrogate_test(data["sectors"], data["dates"], win=win, n=n, end=end)
        out["shift"] = pat.shift_test(data["sectors"], data["dates"], win=win, n=min(400, n * 2), end=end)
        return out

    out = await asyncio.to_thread(run)
    out["ms"] = int((time.time() - t0) * 1000)
    _surrogate_cache[key] = out
    if len(_surrogate_cache) > 20:
        _surrogate_cache.pop(next(iter(_surrogate_cache)))
    return js(out)


@app.get("/api/status")
async def api_status():
    s = eod.state
    return js({"building": s["building"], "done": s["done"], "total": s["total"],
               "asOf": s["data"]["asOf"] if s["data"] else None, "error": s["error"]})


@app.get("/api/stream")
async def api_stream(request: Request):
    """Server-Sent Events. Sends `live` and `quotes` straight away, then again whenever either
    changes. The server-side caches still bound how often NSE and BSE are asked (30 s while the
    market is open), so many open tabs cost no extra upstream requests."""

    async def events():
        last = {"live": None, "quotes": None}
        beat = time.time()
        while not await request.is_disconnected():
            for name, fetch in (("live", live_payload), ("quotes", live.quotes)):
                try:
                    payload = await fetch()
                except Exception:
                    continue
                compare = {k: v for k, v in payload.items() if k != "fetchedAt"} if isinstance(payload, dict) else payload
                sig = json.dumps(clean(compare), sort_keys=True, default=str)
                if sig != last[name]:
                    last[name] = sig
                    if name == "quotes":
                        payload = {"fetchedAt": now_iso(), **payload}
                    yield f"event: {name}\ndata: {json.dumps(clean(payload), separators=(',', ':'))}\n\n"
                    beat = time.time()
            if time.time() - beat > 15:
                yield ": keep-alive\n\n"
                beat = time.time()
            await asyncio.sleep(5 if await live.is_open() else 30)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


# ---------- the built frontend ----------
@app.get("/{path:path}")
async def frontend(path: str):
    if path.startswith("api/"):
        return js({"error": "not found"}, 404)
    if not DIST.exists():
        return Response("Frontend not built yet: run `npm run build` in v2/frontend.", status_code=503, media_type="text/plain")
    f = (DIST / path).resolve()
    if path and f.is_file() and DIST.resolve() in f.parents:
        headers = {"Cache-Control": "no-store"} if f.name in ("sw.js", "manifest.webmanifest", "index.html") else {}
        return FileResponse(f, headers=headers)
    return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-store"})  # hash routing: always the app shell
