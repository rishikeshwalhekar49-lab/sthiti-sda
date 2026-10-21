"""End-of-day data from NSE's official daily files (bhavcopies and index closes), plus
everything computed from them: indicators, scanner hits, regime series, the candidates.

Port of lib/eod.js. The cache layout and file formats are unchanged. The CPU-heavy build
runs in a worker thread so the API stays responsive while it works.
"""
import asyncio
import io
import json
import math
import os
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import analytics as an
from . import ind
from . import patents as pat
from .config import HISTORY_DAYS, LAYERS, SCREENER, SECTORS
from .jsnum import clean, js_round, num
from .net import archive

CACHE = Path(os.environ.get("STHITI_CACHE", Path(__file__).resolve().parent.parent / "cache"))
DIRS = {k: CACHE / k for k in ("cm", "idx", "fo", "meta")}
for d in DIRS.values():
    d.mkdir(parents=True, exist_ok=True)

IST = timezone(timedelta(hours=5, minutes=30))


def ist_now():
    return datetime.now(IST)


def key_of(d):
    return d.strftime("%Y%m%d")


def iso_of(k):
    return f"{k[0:4]}-{k[4:6]}-{k[6:8]}"


def dmy_of(k):
    return f"{k[6:8]}{k[4:6]}{k[0:4]}"


# ---------- csv (same quoting rules as the original's splitLine) ----------
def split_line(line):
    out, cur, q, i = [], "", False, 0
    while i < len(line):
        ch = line[i]
        if q:
            if ch == '"':
                if i + 1 < len(line) and line[i + 1] == '"':
                    cur += '"'
                    i += 1
                else:
                    q = False
            else:
                cur += ch
        elif ch == '"':
            q = True
        elif ch == ",":
            out.append(cur)
            cur = ""
        else:
            cur += ch
        i += 1
    out.append(cur)
    return out


def parse_csv(text):
    lines = [l for l in text.replace("\r\n", "\n").split("\n") if l.strip()]
    head = [h.strip() for h in split_line(lines[0])]
    rows = []
    for l in lines[1:]:
        cells = split_line(l)
        rows.append({h: (cells[i] if i < len(cells) else "").strip() for i, h in enumerate(head)})
    return rows


def unzip_first(buf):
    with zipfile.ZipFile(io.BytesIO(buf)) as z:
        return z.read(z.namelist()[0])


# ---------- cached daily files ----------
def read_json(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return None


def write_json(p, obj):
    Path(p).write_text(json.dumps(obj, separators=(",", ":")))


async def day_equities(k, today_key):
    f, miss = DIRS["cm"] / f"{k}.json", DIRS["cm"] / f"{k}.none"
    hit = read_json(f)
    if hit:
        return hit
    if miss.exists():
        return None
    buf = await archive(f"cm/BhavCopy_NSE_CM_0_0_0_{k}_F_0000.csv.zip")
    if not buf:
        if k != today_key:
            miss.write_text("")
        return None
    try:
        rows = parse_csv(unzip_first(buf).decode("utf-8"))
    except Exception:
        if k != today_key:
            miss.write_text("")
        return None
    out = {r["TckrSymb"]: [num(r.get("OpnPric")), num(r.get("HghPric")), num(r.get("LwPric")), num(r.get("ClsPric")), num(r.get("TtlTradgVol"))]
           for r in rows if r.get("SctySrs") == "EQ"}
    if not out:
        return None
    write_json(f, out)
    return out


async def day_indices(k, today_key):
    f, miss = DIRS["idx"] / f"{k}.json", DIRS["idx"] / f"{k}.none"
    hit = read_json(f)
    if hit:
        return hit
    if miss.exists():
        return None
    buf = await archive(f"indices/ind_close_all_{dmy_of(k)}.csv")
    if not buf:
        if k != today_key:
            miss.write_text("")
        return None
    out = {}
    for r in parse_csv(buf.decode("utf-8", "replace")):
        name = r.get("Index Name")
        if name:
            out[name] = [num(r.get("Closing Index Value")), num(r.get("P/E")), num(r.get("Change(%)"))]
    if not out:
        return None
    write_json(f, out)
    return out


async def day_options(k):
    """NIFTY options from the F&O bhavcopy: fallback when the live chain is unavailable,
    and the source for the contract lot size."""
    f = DIRS["fo"] / f"{k}.json"
    hit = read_json(f)
    if hit:
        return hit
    buf = await archive(f"fo/BhavCopy_NSE_FO_0_0_0_{k}_F_0000.csv.zip")
    if not buf:
        return None
    try:
        rows = parse_csv(unzip_first(buf).decode("utf-8"))
    except Exception:
        return None
    by_expiry, lot, und = {}, None, None
    for r in rows:
        if r.get("FinInstrmTp") != "IDO" or r.get("TckrSymb") != "NIFTY":
            continue
        lot = num(r.get("NewBrdLotQty")) or lot
        und = num(r.get("UndrlygPric")) or und
        ltp = num(r.get("ClsPric"))
        by_expiry.setdefault(r.get("XpryDt"), []).append({
            "K": num(r.get("StrkPric")), "t": r.get("OptnTp"),
            "ltp": ltp if ltp is not None else num(r.get("SttlmPric")),
            "oi": num(r.get("OpnIntrst")), "chgOi": num(r.get("ChngInOpnIntrst")), "vol": num(r.get("TtlTradgVol"))})
    if not lot:
        return None
    out = {"tradeDate": iso_of(k), "lot": lot, "und": und, "expiries": by_expiry}
    write_json(f, out)
    return out


async def nifty500_list():
    f = DIRS["meta"] / "nifty500.json"
    hit = read_json(f)
    if hit and time.time() * 1000 - hit["at"] < 7 * 864e5:
        return hit["rows"]
    buf = await archive("indices/ind_nifty500list.csv")
    if not buf:
        return hit["rows"] if hit else []
    rows = [{"sym": r["Symbol"].strip(), "name": (r.get("Company Name") or "").strip(), "industry": (r.get("Industry") or "").strip()}
            for r in parse_csv(buf.decode("utf-8", "replace")) if r.get("Symbol")]
    write_json(f, {"at": int(time.time() * 1000), "rows": rows})
    return rows


async def pool(items, limit, worker):
    q = list(items)

    async def runner():
        while q:
            await worker(q.pop(0))

    await asyncio.gather(*(runner() for _ in range(limit)))


# ---------- build ----------
state = {"building": False, "done": 0, "total": 0, "data": None, "json": None, "error": None,
         "builtAt": 0.0, "rets": {}, "meta": {}}


def series_of(dates, day_maps, sym, field):
    out = []
    for k in dates:
        row = day_maps[k].get(sym)
        out.append(row[field] if row else None)
    return out


async def build(log=print):
    today = ist_now()
    today_key = key_of(today)
    candidates = []
    i = 0
    while i < 780 and len(candidates) < 560:
        d = today - timedelta(days=i)
        if d.weekday() < 5:
            candidates.append(key_of(d))
        i += 1
    eq, ix = {}, {}
    state["total"], state["done"] = len(candidates), 0

    async def fetch_day(k):
        try:
            e = await day_equities(k, today_key)
            if e:
                eq[k] = e
                i2 = await day_indices(k, today_key)
                if i2:
                    ix[k] = i2
        except Exception as err:
            log(f"  {k}: {err}")
        state["done"] += 1

    await pool(candidates, 4, fetch_day)
    dates = sorted(k for k in eq if k in ix)[-HISTORY_DAYS:]
    if len(dates) < 60:
        raise RuntimeError(f"only {len(dates)} trading days downloaded; NSE archive may be blocking this machine")
    log(f"  {len(dates)} trading days, latest {iso_of(dates[-1])}")
    lst = await nifty500_list()

    fo = None  # options: latest F&O bhavcopy (the live chain is layered on top by the server)
    for j in range(len(dates) - 1, max(-1, len(dates) - 5), -1):
        try:
            fo = await day_options(dates[j])
        except Exception:
            fo = None
        if fo:
            break
    return await asyncio.to_thread(_compute, dates, eq, ix, lst, fo, log)


def _compute(dates, eq, ix, lst, fo, log):
    last = dates[-1]
    meta = {r["sym"]: r for r in lst}

    def idx_series(name):
        return [(ix[k][name][0] if ix[k].get(name) else None) for k in dates]

    nifty = idx_series("Nifty 50")
    vix = idx_series("India VIX")
    sectors = [s for s in ({"name": n, "code": c, "c": idx_series(n)} for n, c in SECTORS) if all(v is not None for v in s["c"])]
    layers = [s for s in ({"name": n, "code": c, "group": g, "c": idx_series(n)} for n, c, g in LAYERS) if all(v is not None for v in s["c"])]

    stocks = {}
    for s in SCREENER:
        o, h, l = series_of(dates, eq, s["sym"], 0), series_of(dates, eq, s["sym"], 1), series_of(dates, eq, s["sym"], 2)
        c, v = series_of(dates, eq, s["sym"], 3), series_of(dates, eq, s["sym"], 4)
        valid = [i for i, x in enumerate(c) if x is not None]
        if len(valid) < 210:
            log(f"  {s['sym']}: only {len(valid)} days, skipped")
            continue
        cc, hh, ll = [c[i] for i in valid], [h[i] for i in valid], [l[i] for i in valid]
        r = ind.rsi(cc)
        stocks[s["sym"]] = {
            "sym": s["sym"], "name": (meta.get(s["sym"]) or {}).get("name") or s["sym"], "sector": s["sector"],
            "sectorIndex": s["sectorIndex"], "bse": s["bse"],
            "dates": [iso_of(dates[i]) for i in valid], "o": [o[i] for i in valid], "h": hh, "l": ll, "c": cc, "v": [v[i] for i in valid],
            "rsi": r[-1], "atr": ind.atr(hh, ll, cc), "beta": ind.beta(c, nifty),
            "sma50": ind.sma(cc, 50), "sma200": ind.sma(cc, 200),
            "hi52": max(hh[-250:]), "lo52": min(ll[-250:]),
        }

    # scanner across the NIFTY 500
    scan, universe = [], []
    for row in lst:
        c = series_of(dates, eq, row["sym"], 3)
        if c[-1] is None:
            continue
        valid = [i for i, x in enumerate(c) if x is not None]
        if len(valid) < 215:
            continue
        h_all, l_all, v_all = series_of(dates, eq, row["sym"], 1), series_of(dates, eq, row["sym"], 2), series_of(dates, eq, row["sym"], 4)
        cc, hh = [c[i] for i in valid], [h_all[i] for i in valid]
        ll, vv = [l_all[i] for i in valid], [v_all[i] for i in valid]
        n = len(cc)
        r = ind.rsi(cc)
        s50, s50p = ind.sma(cc, 50), ind.sma(cc, 50, n - 2)
        s200, s200p = ind.sma(cc, 200), ind.sma(cc, 200, n - 2)
        close, prev = cc[n - 1], cc[n - 2]
        chg = (close / prev - 1) * 100
        avg_vol = sum(vv[-21:-1]) / 20
        vol_ratio = vv[n - 1] / avg_vol if avg_vol else None
        hi250, lo250 = max(hh[-251:-1]), min(ll[-251:-1])
        universe.append({"sym": row["sym"], "name": row["name"], "industry": row["industry"], "dates": [iso_of(dates[i]) for i in valid],
                         "closes": cc, "highs": hh, "close": close, "chg": chg, "rsi": r[n - 1], "volRatio": vol_ratio})
        hits = []
        if s200 and s200p and close > s200 and prev <= s200p:
            hits.append(("ma", "Crossed above the 200-day MA"))
        if s200 and s200p and close < s200 and prev >= s200p:
            hits.append(("ma", "Crossed below the 200-day MA"))
        if s50 and s200 and s50p and s200p and s50 > s200 and s50p <= s200p:
            hits.append(("ma", "Golden cross: 50-day above 200-day"))
        if s50 and s200 and s50p and s200p and s50 < s200 and s50p >= s200p:
            hits.append(("ma", "Death cross: 50-day below 200-day"))
        if close > hi250:
            hits.append(("pattern", "New 52-week high"))
        if close < lo250:
            hits.append(("pattern", "New 52-week low"))
        if ind.double_bottom(cc):
            hits.append(("pattern", "Double bottom: neckline broken"))
        if r[n - 1] > 70 and r[n - 2] <= 70:
            hits.append(("rsi", f"RSI crossed above 70 ({js_round(r[n - 1])})"))
        if r[n - 1] < 30 and r[n - 2] >= 30:
            hits.append(("rsi", f"RSI crossed below 30 ({js_round(r[n - 1])})"))
        for group, sig in hits:
            scan.append({"sym": row["sym"], "name": row["name"], "industry": row["industry"], "group": group, "sig": sig,
                         "close": close, "chg": chg, "volRatio": vol_ratio, "rsi": r[n - 1],
                         "spark": [js_round(x * 100) / 100 for x in cc[-60:]]})
    scan.sort(key=lambda x: -(x["volRatio"] or 0))

    index_pe = {name: row[1] for name, row in ix[last].items() if row[1] is not None}

    rets_by_sym = {u["sym"]: an.log_rets(u["closes"])[-90:] for u in universe}
    nifty_rets = an.log_rets([v for v in nifty if v is not None])
    metrics = an.universe_metrics([u["sym"] for u in universe], rets_by_sym, nifty_rets)
    topo = [{"sym": u["sym"], "name": u["name"], "industry": u["industry"], "close": u["close"], "chg": u["chg"], "rsi": u["rsi"],
             "volRatio": u["volRatio"], "dist": metrics[u["sym"]]["dist"], "avgCorr": metrics[u["sym"]]["avgCorr"],
             "corrChg": metrics[u["sym"]]["corrChg"], "corrMkt": metrics[u["sym"]]["corrMkt"]}
            for u in universe if u["sym"] in metrics]
    topo.sort(key=lambda x: -x["dist"])
    iso_dates = [iso_of(k) for k in dates]
    regime = an.regime_series(sectors, iso_dates)
    t0 = time.time()
    calibration = pat.calibrate(sectors, iso_dates)
    iv = pat.iv_surface(fo) if fo else None
    log(f"  calibration sweep: window {calibration['chosen']} sessions ({time.time() - t0:.1f}s)"
        + (f" · IV surface {len(iv['expiries'])} expiries × {len(iv['strikes'])} strikes, {iv['basins']} basins" if iv else " · no IV surface"))
    backtests = an.run_backtests(universe, regime["byDate"])
    state["rets"] = rets_by_sym
    state["meta"] = {u["sym"]: {"name": u["name"], "industry": u["industry"]} for u in universe}
    log(f"  topology on {len(topo)} stocks · backtest trades: " + ", ".join(f"{k} {len(v['trades'])}" for k, v in backtests.items()))
    return {
        "asOf": iso_of(last), "dates": iso_dates, "nifty": nifty, "vix": vix, "sectors": sectors, "stocks": stocks, "indexPE": index_pe,
        "scan": scan[:60], "scanUniverse": len(lst), "topo": topo, "layers": layers, "backtests": backtests,
        "calibration": calibration, "ivSurface": iv,
        "regimeThresholds": {"p33": regime["p33"], "p67": regime["p67"]},
        "fo": fo, "builtAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }


_build_task = None


async def ensure_data(log=print):
    """Serve the built dataset for two hours, then rebuild. While a build is running, callers
    get whatever was built before (None on first start) instead of waiting."""
    global _build_task
    if state["data"] and time.time() - state["builtAt"] < 2 * 3600:
        return state["data"]
    if state["building"]:
        return state["data"]
    state["building"], state["error"] = True, None
    try:
        data = await build(log)
        state["data"], state["builtAt"] = data, time.time()
        state["json"] = json.dumps(clean(data), separators=(",", ":"), allow_nan=False).encode()
        return data
    except Exception as e:
        state["error"] = str(e)
        raise
    finally:
        state["building"] = False


async def index_range(from_iso, to_iso, log=print):
    """Sector index closes for an arbitrary date range (used by the crash replay)."""
    today_key = key_of(ist_now())
    start, end = datetime.fromisoformat(from_iso), datetime.fromisoformat(to_iso)
    keys, d = [], start
    while d <= end:
        if d.weekday() < 5:
            keys.append(key_of(d))
        d += timedelta(days=1)
    if len(keys) > 500:
        raise RuntimeError("range too long")
    got = {}

    async def fetch(k):
        try:
            r = await day_indices(k, today_key)
            if r:
                got[k] = r
        except Exception as err:
            log(f"  {k}: {err}")

    await pool(keys, 4, fetch)
    dates = sorted(got)
    if len(dates) < 70:
        raise RuntimeError(f"only {len(dates)} sessions available for that range")
    sectors = [s for s in ({"name": n, "code": c, "c": [(got[k][n][0] if got[k].get(n) else None) for k in dates]} for n, c in SECTORS)
               if all(v is not None for v in s["c"])]
    nifty = [(got[k]["Nifty 50"][0] if got[k].get("Nifty 50") else None) for k in dates]
    return {"from": iso_of(dates[0]), "to": iso_of(dates[-1]), "dates": [iso_of(k) for k in dates], "sectors": sectors, "nifty": nifty}
