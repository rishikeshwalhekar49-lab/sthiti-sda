"""Live reads: NSE indices, breadth, FII/DII flows, option chain; BSE quotes and
fundamentals. Port of lib/live.js, including its stale-value fallback and 9 s deadline."""
import asyncio
import re
import time
from datetime import datetime, timedelta, timezone

from .config import SCREENER
from .jsnum import parse_float, parse_float_or_none, parse_int_or_none
from .net import bse_api, nse_api

_store: dict = {}
_inflight: dict = {}


def now_ms():
    return int(time.time() * 1000)


async def cached(key, ttl_ms, fn):
    """Fresh value within ttl; otherwise one shared fetch. On failure, keep serving the last
    good value marked stale (or None if there never was one), with the error attached."""
    old = _store.get(key)
    if old and now_ms() - old["at"] < ttl_ms:
        return old
    if key in _inflight:
        return await asyncio.shield(_inflight[key])

    async def run():
        try:
            value = await asyncio.wait_for(fn(), 9.0)
            entry = {"value": value, "at": now_ms(), "error": None, "stale": False}
        except asyncio.TimeoutError:
            entry = _fail(old, "timed out after 9s")
        except Exception as e:
            entry = _fail(old, str(e) or type(e).__name__)
        _store[key] = entry
        _inflight.pop(key, None)
        return entry

    task = asyncio.ensure_future(run())
    _inflight[key] = task
    return await asyncio.shield(task)


def _fail(old, msg):
    if old:
        return {"value": old["value"], "at": old["at"], "error": msg, "stale": True}
    return {"value": None, "at": now_ms(), "error": msg, "stale": True}


IST = timezone(timedelta(hours=5, minutes=30))
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def parse_nse_date(s):  # "29-Sep-2026" -> ordinal day
    d, m, y = str(s).split("-")
    return datetime(int(y), MONTHS[m], int(d)).toordinal()


def ist_today():
    return datetime.now(IST).date().toordinal()


def clock_open():
    """NSE's own flag reads "Open" outside trading hours, so check the IST clock too."""
    n = datetime.now(IST)
    mins = n.hour * 60 + n.minute
    return n.weekday() <= 4 and 9 * 60 + 15 <= mins <= 15 * 60 + 40


async def market():
    async def fetch():
        d = await nse_api("marketStatus")
        cm = next((m for m in d.get("marketState") or [] if re.search("capital market", m.get("market", ""), re.I)), {})
        status = cm.get("marketStatus") or ""
        says_open = bool(re.search("open", status, re.I))
        return {"open": says_open and clock_open(), "status": status or "Unknown", "tradeDate": cm.get("tradeDate") or "",
                "message": cm.get("marketStatusMessage") or "", "sourceSaysOpen": says_open, "nifty": cm.get("last")}

    e = await cached("market", 60_000, fetch)
    if not e["value"]:  # never hand back a null market: fall back to the IST trading clock
        return {**e, "value": {"open": clock_open(), "status": "Unknown", "tradeDate": "", "message": "NSE status unavailable",
                               "sourceSaysOpen": False, "nifty": None}}
    return e


async def is_open():
    return (await market())["value"].get("open") is True


def ttl(open_, open_ms, closed_ms):
    return open_ms if open_ else closed_ms


async def indices():
    open_ = await is_open()

    async def fetch():
        d = await nse_api("allIndices")
        out = {}
        for r in d.get("data") or []:
            out[(r.get("index") or "").upper()] = {
                "last": r.get("last"), "change": r.get("variation"), "pct": r.get("percentChange"),
                "open": r.get("open"), "high": r.get("high"), "low": r.get("low"), "prevClose": r.get("previousClose"),
                "pe": parse_float_or_none(r.get("pe")), "pb": parse_float_or_none(r.get("pb")),
                "advances": parse_int_or_none(r.get("advances")), "declines": parse_int_or_none(r.get("declines")),
                "unchanged": parse_int_or_none(r.get("unchanged")), "yearHigh": r.get("yearHigh"), "yearLow": r.get("yearLow"),
            }
        return out

    return await cached("indices", ttl(open_, 30_000, 300_000), fetch)


async def flows():
    open_ = await is_open()

    async def fetch():
        rows = await nse_api("fiidiiTradeReact") or []

        def pick(pattern):
            r = next((x for x in rows if re.search(pattern, x.get("category") or "", re.I)), None)
            if not r:
                return None
            return {"date": r.get("date"), "buy": parse_float(r.get("buyValue")), "sell": parse_float(r.get("sellValue")),
                    "net": parse_float(r.get("netValue"))}

        return {"fii": pick("FII|FPI"), "dii": pick("DII")}

    return await cached("flows", ttl(open_, 600_000, 1_800_000), fetch)


def _pick(con, standalone):
    c, a = parse_float(con), parse_float(standalone)
    if c is not None and c > 0:
        return {"value": c, "basis": "consolidated"}
    if a is not None and a > 0:
        return {"value": a, "basis": "standalone"}
    return None


async def _quote(s, open_, errors, out):
    async def head_fetch():
        d = await bse_api(f"getScripHeaderData/w?Debtflag=&scripcode={s['bse']}&seriesid=")
        h, c = d.get("Header") or {}, d.get("CurrRate") or {}
        return {"ltp": parse_float_or_none(c.get("LTP")) or parse_float_or_none(h.get("LTP")),
                "change": parse_float(c.get("Chg")), "pct": parse_float(c.get("PcChg")),
                "open": parse_float_or_none(h.get("Open")), "high": parse_float_or_none(h.get("High")),
                "low": parse_float_or_none(h.get("Low")), "prevClose": parse_float_or_none(h.get("PrevClose")),
                "name": (d.get("Cmpname") or {}).get("FullN") or s["sym"]}

    async def fund_fetch():
        h, t, hl = await asyncio.gather(
            bse_api(f"ComHeadernew/w?quotetype=EQ&scripcode={s['bse']}&seriesid="),
            bse_api(f"StockTrading/w?flag=&quotetype=EQ&scripcode={s['bse']}"),
            bse_api(f"HighLow/w?Type=EQ&flag=C&scripcode={s['bse']}"),
        )
        return {
            "securityId": h.get("SecurityId"),
            "pe": _pick(h.get("ConPE"), h.get("PE")), "eps": _pick(h.get("ConEPS"), h.get("EPS")),
            "pb": _pick(h.get("ConPB"), h.get("PB")), "roe": _pick(h.get("ConROE"), h.get("ROE")),
            "npm": parse_float_or_none(h.get("NPM")), "opm": parse_float_or_none(h.get("OPM")),
            "industry": h.get("Industry") or "", "sector": h.get("Sector") or "", "faceValue": parse_float_or_none(h.get("FaceVal")),
            "mcapCr": parse_float_or_none(str(t.get("MktCapFull") or "").replace(",", "")),
            "high52": parse_float_or_none(hl.get("Fifty2WkHigh_adj")), "low52": parse_float_or_none(hl.get("Fifty2WkLow_adj")),
            "weekRange": hl.get("WeekHighLow"),
        }

    head = await cached("bse:head:" + s["bse"], ttl(open_, 20_000, 300_000), head_fetch)
    fund = await cached("bse:fund:" + s["bse"], 6 * 3_600_000, fund_fetch)
    if head["error"]:
        errors.append(f"{s['sym']} quote: {head['error']}")
    if fund["error"]:
        errors.append(f"{s['sym']} fundamentals: {fund['error']}")
    out[s["sym"]] = {"sym": s["sym"], "sectorIndex": s["sectorIndex"], "sector": s["sector"],
                     "quote": head["value"], "quoteAt": head["at"], "quoteStale": head["stale"],
                     "fundamentals": fund["value"], "fundamentalsAt": fund["at"]}


async def quotes():
    open_ = await is_open()
    out, errors = {}, []
    await asyncio.gather(*(_quote(s, open_, errors, out) for s in SCREENER))
    return {"stocks": out, "errors": errors}


def _leg(x):
    if not x:
        return None
    return {"ltp": x.get("lastPrice"), "iv": x.get("impliedVolatility"), "oi": x.get("openInterest"),
            "chgOi": x.get("changeinOpenInterest"), "vol": x.get("totalTradedVolume")}


async def option_chain():
    open_ = await is_open()

    async def exp_fetch():
        d = await nse_api("option-chain-contract-info?symbol=NIFTY", "https://www.nseindia.com/option-chain")
        return d.get("expiryDates") or []

    exp = await cached("opt:expiries", 3_600_000, exp_fetch)
    dates = exp["value"] or []
    today = ist_today()
    chosen = next((d for d in dates if parse_nse_date(d) > today), None) \
        or next((d for d in dates if parse_nse_date(d) == today), None) or (dates[0] if dates else None)
    if not chosen:
        return {"value": None, "error": exp["error"] or "no expiries", "at": now_ms()}

    async def chain_fetch():
        from urllib.parse import quote
        d = await nse_api(f"option-chain-v3?type=Indices&symbol=NIFTY&expiry={quote(chosen)}", "https://www.nseindia.com/option-chain")
        rec = d.get("records") or {}
        strikes = []
        for r in rec.get("data") or []:
            k = r.get("strikePrice")
            if k is None:
                k = (r.get("CE") or r.get("PE") or {}).get("strikePrice")
            if not k:
                continue
            strikes.append({"K": k, "ce": _leg(r.get("CE")), "pe": _leg(r.get("PE"))})
        strikes.sort(key=lambda x: x["K"])
        return {"source": "live", "expiry": chosen, "timestamp": rec.get("timestamp") or "",
                "und": rec.get("underlyingValue"), "strikes": strikes}

    return await cached("opt:chain:" + chosen, ttl(open_, 30_000, 600_000), chain_fetch)
