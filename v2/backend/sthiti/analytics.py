"""Correlation/topology metrics, regime-conditioned backtests and portfolio fragility.

Port of lib/analytics.js. Correlation matrices use numpy; every other step follows the
original line for line, including its edge cases (fewer than 10 points -> 0, a flat series
-> 0, clamping to [-1, 1]).
"""
import math
from collections import deque

import numpy as np

from . import ind
from .jsnum import js_round

WIN = 60  # trading days in a correlation window


def mean(a):
    return sum(a) / len(a) if len(a) else 0


def log_rets(c):
    return [math.log(c[i] / c[i - 1]) for i in range(1, len(c))]


def corr(a, b):
    n = min(len(a), len(b))
    if n < 10:
        return 0
    A, B = a[len(a) - n:], b[len(b) - n:]
    ma, mb = sum(A) / n, sum(B) / n
    cov = va = vb = 0.0
    for i in range(n):
        x, y = A[i] - ma, B[i] - mb
        cov += x * y
        va += x * x
        vb += y * y
    d = math.sqrt(va * vb)
    return max(-1.0, min(1.0, cov / d)) if d else 0


def corr_matrix_np(X):
    """Pearson correlation between the rows of X, with corr()'s conventions: rows shorter
    than 10 points or with zero variance correlate 0, and results are clamped to [-1, 1]."""
    X = np.asarray(X, dtype=float)
    k, n = X.shape
    if n < 10:
        return np.zeros((k, k))
    Xc = X - X.mean(axis=1, keepdims=True)
    cov = Xc @ Xc.T
    v = np.diag(cov)
    d = np.sqrt(np.outer(v, v))
    with np.errstate(invalid="ignore", divide="ignore"):
        C = np.where(d > 0, cov / d, 0.0)
    return np.clip(C, -1.0, 1.0)


def dist(rho):
    return math.sqrt(max(0.0, 2 * (1 - rho)))


def _label_fn(p33, p67):
    return lambda rho: "calm" if rho < p33 else ("trans" if rho < p67 else "stress")


def mean_pair_rho(C):
    k = C.shape[0]
    iu = np.triu_indices(k, 1)
    return float(C[iu].mean())


def regime_series(sectors, dates):
    """Mean pairwise sector correlation for every 60-session window, and the
    33rd/67th-percentile bands that turn it into calm / transitional / stress."""
    R = np.array([log_rets(s["c"]) for s in sectors])
    out = []
    for end in range(WIN - 1, R.shape[1]):
        C = corr_matrix_np(R[:, end - WIN + 1:end + 1])
        out.append({"date": dates[end + 1], "rho": mean_pair_rho(C)})
    srt = sorted(o["rho"] for o in out)
    p33 = srt[math.floor(len(srt) * 0.33)]
    p67 = srt[math.floor(len(srt) * 0.67)]
    label = _label_fn(p33, p67)
    by_date = {o["date"]: label(o["rho"]) for o in out}
    return {"series": out, "p33": p33, "p67": p67, "byDate": by_date, "label": label}


def universe_metrics(symbols, rets_by_sym, nifty_rets):
    """Topo-Screen: each stock's correlation distance from the market's centre, and how much
    its average coupling has changed over the last month."""
    syms = [s for s in symbols if len(rets_by_sym.get(s) or []) >= WIN]
    if len(syms) < 2:
        return {}
    recent = np.array([rets_by_sym[s][-30:] for s in syms])
    prior = np.array([rets_by_sym[s][-60:-30] for s in syms])
    Cr, Cp = corr_matrix_np(recent), corr_matrix_np(prior)
    n = len(syms) - 1
    avg = (Cr.sum(axis=1) - np.diag(Cr)) / n
    avg_prev = (Cp.sum(axis=1) - np.diag(Cp)) / n
    n_recent = nifty_rets[-30:]
    out = {}
    for k, s in enumerate(syms):
        a = float(avg[k])
        out[s] = {
            "avgCorr": a,
            "dist": dist(a),
            "corrChg": a - float(avg_prev[k]),
            "corrMkt": corr(rets_by_sym[s][-30:], n_recent),
        }
    return out


# ---------- regime-conditioned backtests ----------
# Entries and exits both fill at the next session's close, so no bar is used before it exists.
STRATEGIES = {
    "golden": {"name": "Golden cross (50-day over 200-day)", "hold": 60},
    "rsi30": {"name": "RSI(14) drops below 30", "hold": 20},
    "break52": {"name": "New 52-week high", "hold": 20},
}


def rolling_sma(a, n):
    out = [None] * len(a)
    s = 0.0
    for i in range(len(a)):
        s += a[i]
        if i >= n:
            s -= a[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def rolling_max_prev(a, n):
    """Highest value over the previous n bars, not counting the current one."""
    out = [None] * len(a)
    dq = deque()
    for i in range(len(a)):
        out[i] = a[dq[0]] if dq else None
        while dq and a[dq[-1]] <= a[i]:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - n:
            dq.popleft()
    return out


def backtest_symbol(key, closes, highs, dates):
    n = len(closes)
    trades = []
    if n < 260:
        return trades
    r = ind.rsi(closes)
    s50 = rolling_sma(closes, 50) if key == "golden" else None
    s200 = rolling_sma(closes, 200) if key == "golden" else None
    hi250 = rolling_max_prev(highs, 250) if key == "break52" else None
    opened = None
    for i in range(205, n - 1):
        if opened:
            if key == "golden":
                ex = (s50[i] < s200[i]) or (i - opened["i"] >= STRATEGIES["golden"]["hold"])
            elif key == "rsi30":
                ex = r[i] > 50 or i - opened["i"] >= STRATEGIES["rsi30"]["hold"]
            else:
                ex = i - opened["i"] >= STRATEGIES["break52"]["hold"] or closes[i] < opened["px"] * 0.92
            if ex:
                px = closes[i + 1]
                trades.append({"entry": opened["date"], "exit": dates[i + 1], "ret": (px / opened["px"] - 1) * 100, "bars": i + 1 - opened["i"]})
                opened = None
            continue
        if key == "golden":
            sig = s50[i] is not None and s200[i] is not None and s50[i] > s200[i] and s50[i - 1] <= s200[i - 1]
        elif key == "rsi30":
            sig = r[i] is not None and r[i - 1] is not None and r[i] < 30 and r[i - 1] >= 30
        else:
            sig = hi250[i] is not None and closes[i] > hi250[i]
        if sig:
            opened = {"i": i + 1, "px": closes[i + 1], "date": dates[i + 1]}
    return trades


def run_backtests(universe, regime_by_date):
    out = {}
    for key, spec in STRATEGIES.items():
        rows = []
        for u in universe:
            for t in backtest_symbol(key, u["closes"], u["highs"], u["dates"]):
                rows.append({"sym": u["sym"], "entry": t["entry"], "exit": t["exit"],
                             "ret": js_round(t["ret"] * 100) / 100, "bars": t["bars"],
                             "regime": regime_by_date.get(t["entry"])})
        out[key] = {"name": spec["name"], "trades": rows}
    return out


# ---------- portfolio fragility ----------
def portfolio_report(holdings, rets_by_sym, meta):
    rows = [dict(h) for h in holdings if len(rets_by_sym.get(h["sym"]) or []) >= 30]
    missing = [h["sym"] for h in holdings if not len(rets_by_sym.get(h["sym"]) or [])]
    if len(rows) < 2:
        return {"error": "Need at least two holdings with price history.", "missing": missing}
    total_w = sum(h["weight"] for h in rows) or 1
    for h in rows:
        h["w"] = h["weight"] / total_w
    n = len(rows)
    R = [rets_by_sym[h["sym"]][-WIN:] for h in rows]
    C = [[1.0] * n for _ in range(n)]
    D = [[0.0] * n for _ in range(n)]
    wsum = psum = 0.0
    pn = 0
    for i in range(n):
        for j in range(i + 1, n):
            c = corr(R[i], R[j])
            C[i][j] = C[j][i] = c
            D[i][j] = D[j][i] = dist(c)
            wsum += 2 * rows[i]["w"] * rows[j]["w"] * c
            psum += c
            pn += 1
    mean_rho = psum / pn
    own = sum(h["w"] * h["w"] for h in rows)
    eff_n = 1 / (own + wsum)  # effective number of independent positions
    # single-linkage clusters at correlation 0.6 and above
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if C[i][j] >= 0.6:
                a, b = find(i), find(j)
                if a != b:
                    parent[a] = b
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    clusters = []
    for g in groups.values():
        if len(g) < 2:
            continue
        w = sum(rows[i]["w"] for i in g)
        sectors = []
        for i in g:
            s = (meta.get(rows[i]["sym"]) or {}).get("industry")
            if s and s not in sectors:
                sectors.append(s)
        inner, cnt = 0.0, 0
        for a in range(len(g)):
            for b in range(a + 1, len(g)):
                inner += C[g[a]][g[b]]
                cnt += 1
        clusters.append({"members": [rows[i]["sym"] for i in g], "weight": w, "sectors": sectors,
                         "meanRho": inner / cnt if cnt else 1})
    clusters.sort(key=lambda c: -c["weight"])
    per = []
    for i, h in enumerate(rows):
        s = sum(C[i][j] for j in range(n) if j != i)
        m = meta.get(h["sym"]) or {}
        per.append({"sym": h["sym"], "weight": h["w"], "avgRho": s / (n - 1),
                    "name": m.get("name") or h["sym"], "industry": m.get("industry") or ""})
    per.sort(key=lambda p: -p["avgRho"])
    return {"symbols": [h["sym"] for h in rows], "weights": [h["w"] for h in rows], "D": D,
            "meanRho": mean_rho, "effN": eff_n, "clusters": clusters, "perHolding": per,
            "missing": missing, "window": WIN}
