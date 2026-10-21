"""HTTP for NSE and BSE public endpoints. Port of lib/net.js.

NSE and BSE drop idle keep-alive connections without telling the client, and a reused
dead socket stalls until the timeout, so their clients open a fresh connection per request.
The archive host is fine with keep-alive because its bursts are back to back.
"""
import asyncio
import json
import time

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
BASE_HEADERS = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "identity"}
NO_REUSE = httpx.Limits(max_connections=6, max_keepalive_connections=0)

_nse = None
_bse = None
_archive = None


def _clients():
    global _nse, _bse, _archive
    if _nse is None:
        _nse = httpx.AsyncClient(headers=BASE_HEADERS, limits=NO_REUSE, follow_redirects=True)
        _bse = httpx.AsyncClient(headers=BASE_HEADERS, limits=NO_REUSE, follow_redirects=True)
        _archive = httpx.AsyncClient(headers=BASE_HEADERS, follow_redirects=True,
                                     limits=httpx.Limits(max_connections=6, max_keepalive_connections=2, keepalive_expiry=2.0))
    return _nse, _bse, _archive


def parse_json(body: bytes, label: str):
    first = body[:1].decode("utf-8", "ignore")
    if first not in ("{", "["):
        raise RuntimeError(f"{label}: not JSON (blocked or unavailable)")
    return json.loads(body.decode("utf-8"))


# ---------- NSE session (cookies from a page visit) ----------
_warmed_at = 0.0
_warming: asyncio.Task | None = None


def reset_session():
    """NSE's edge starts holding requests once the session tokens go stale: the request
    doesn't fail, it never answers. A fresh session fixes it."""
    global _warmed_at
    nse, _, _ = _clients()
    nse.cookies.clear()
    _warmed_at = 0.0


async def _do_warm():
    global _warmed_at, _warming
    nse, _, _ = _clients()
    try:
        await nse.get("https://www.nseindia.com/market-data/live-equity-market",
                      headers={"Accept": "text/html,application/xhtml+xml"}, timeout=6.0)
    except Exception:
        pass  # keep whatever cookies we have
    _warmed_at = time.time()
    _warming = None


async def warm_nse(force=False):
    global _warming
    nse, _, _ = _clients()
    age = time.time() - _warmed_at
    if not force and age < 4 * 60:
        return
    if age > 10 * 60:
        nse.cookies.clear()  # never reuse a session for long
    if _warming is not None:
        return await asyncio.shield(_warming)  # one warm-up at a time
    if force and age < 20:
        return  # don't hammer on repeated failures
    _warming = asyncio.ensure_future(_do_warm())
    return await asyncio.shield(_warming)


async def nse_api(path_and_query: str, referer="https://www.nseindia.com/market-data/live-equity-market"):
    await warm_nse(False)
    nse, _, _ = _clients()
    url = "https://www.nseindia.com/api/" + path_and_query
    label = "NSE " + path_and_query.split("?")[0]
    last_err = None
    for attempt in range(2):
        try:
            r = await nse.get(url, headers={"Accept": "application/json, text/plain, */*", "Referer": referer},
                              timeout=9.0 if attempt else 6.0)
            if r.status_code == 200:
                try:
                    return parse_json(r.content, label)
                except Exception as e:
                    last_err = e
            else:
                last_err = RuntimeError(f"{label}: HTTP {r.status_code}")
        except httpx.TimeoutException:
            last_err = RuntimeError(f"timed out after {9 if attempt else 6}s")  # usually a stale session
        except Exception as e:
            last_err = e
        reset_session()
        await warm_nse(True)
    raise last_err or RuntimeError("NSE request failed")


# ---------- BSE ----------
# BSE drops connections when a burst arrives, so cap concurrency and retry once.
_bse_limit = None


async def bse_api(path_and_query: str):
    global _bse_limit
    if _bse_limit is None:
        _bse_limit = asyncio.Semaphore(3)
    _, bse, _ = _clients()
    label = "BSE " + path_and_query.split("/")[0]
    async with _bse_limit:
        last_err = None
        for attempt in range(2):
            try:
                r = await bse.get("https://api.bseindia.com/BseIndiaAPI/api/" + path_and_query, timeout=8.0,
                                  headers={"Accept": "application/json, text/plain, */*",
                                           "Origin": "https://www.bseindia.com", "Referer": "https://www.bseindia.com/"})
                if r.status_code != 200:
                    raise RuntimeError(f"{label}: HTTP {r.status_code}")
                return parse_json(r.content, label)
            except Exception as e:
                last_err = e
                if attempt == 0:
                    await asyncio.sleep(0.4)
        raise last_err


# ---------- NSE archives (official daily files) ----------
async def archive(path_rel: str):
    _, _, arc = _clients()
    r = await arc.get("https://nsearchives.nseindia.com/content/" + path_rel, timeout=30.0)
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        raise RuntimeError(f"NSE archive {path_rel}: HTTP {r.status_code}")
    return r.content
