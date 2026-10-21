"""Working prototypes of the seven patent candidates, on real data. Port of lib/patents.js.

  1 streaming update        - client (incremental loop) + timings
  2 attribution             - client (ranked drivers from these correlations)
  3 bifiltration            - client (Hilbert function over correlation x realised volatility)
  4 self-calibration        - calibrate()
  5 surrogate gate          - surrogate_test(), shift_test()
  6 cross-asset contagion   - layer series prepared in eod.py, tracked on the client
  7 IV-surface topology     - iv_surface() + cubical_h0()
"""
import math
from datetime import date

import numpy as np

from . import analytics as an
from .jsnum import js_round

M32 = 0xFFFFFFFF


def mean(a):
    return sum(a) / len(a) if len(a) else 0


# ---------- persistence on a distance matrix (same algorithm as the client) ----------
# Columns of the boundary matrix are Python ints used as bitsets over edge indices:
# symmetric difference is XOR and the pivot ("low") is the highest set bit. Identical
# results to the original's sorted-list reduction, at a fraction of the cost.
_TRI_CACHE = {}


def _triangles(n):
    if n not in _TRI_CACHE:
        _TRI_CACHE[n] = [(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)]
    return _TRI_CACHE[n]


def persistence(D):
    D = [list(map(float, row)) for row in D]
    n = len(D)
    E = [{"i": i, "j": j, "d": D[i][j]} for i in range(n) for j in range(i + 1, n)]
    E.sort(key=lambda e: e["d"])  # stable, as Array.prototype.sort is
    eid = {}
    for x, e in enumerate(E):
        eid[(e["i"], e["j"])] = x
    par = list(range(n))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    h0 = []
    for e in E:
        a, b = find(e["i"]), find(e["j"])
        if a != b:
            par[a] = b
            h0.append({"b": 0, "d": e["d"]})
    T = []
    for i, j, k in _triangles(n):
        t = sorted((eid[(i, j)], eid[(i, k)], eid[(j, k)]))
        T.append(t)
    T.sort(key=lambda t: (t[2], t[1], t[0]))
    pivot = {}
    h1 = []
    for t in T:
        c = (1 << t[0]) | (1 << t[1]) | (1 << t[2])
        death = E[t[2]]["d"]
        while c:
            low = c.bit_length() - 1
            p = pivot.get(low)
            if p is None:
                break
            c ^= p
        if c:
            low = c.bit_length() - 1
            pivot[low] = c
            birth = E[low]["d"]
            if death - birth > 1e-9:
                h1.append({"b": birth, "d": death})
    return {"h0": h0, "h1": h1, "edges": len(E)}


def landscape_l1(bars):
    return sum((b["d"] - b["b"]) * (b["d"] - b["b"]) / 4 for b in bars)


def corr_matrix(R, end, win):
    """Correlation-distance matrix and mean pairwise correlation for the window ending at `end`."""
    R = np.asarray(R, dtype=float)
    C = an.corr_matrix_np(R[:, end - win + 1:end + 1])
    D = np.sqrt(np.maximum(0.0, 2 * (1 - C)))
    np.fill_diagonal(D, 0.0)
    return {"D": D.tolist(), "rho": an.mean_pair_rho(C)}


# ---------- candidate 4: self-calibrating window ----------
def wasserstein1(a, b):
    x = sorted((p["d"] - p["b"] for p in a), reverse=True)
    y = sorted((p["d"] - p["b"] for p in b), reverse=True)
    n = max(len(x), len(y))
    return sum(abs((x[i] if i < len(x) else 0) - (y[i] if i < len(y) else 0)) for i in range(n))


def calibrate(sectors, dates, windows=(20, 30, 40, 60, 80, 100, 120), false_alarm_target=0.05):
    """For each window length, measure how much consecutive persistence diagrams move during
    calm stretches, and how often the label flips away from a calm neighbourhood. Pick the
    steadiest window that stays under the false-alarm target."""
    R = np.array([an.log_rets(s["c"]) for s in sectors])
    results = []
    for win in windows:
        rhos, diagrams = [], []
        for end in range(win - 1, R.shape[1]):
            m = corr_matrix(R, end, win)
            rhos.append(m["rho"])
            diagrams.append(persistence(m["D"]))
        srt = sorted(rhos)
        p33 = srt[math.floor(len(srt) * 0.33)]
        p67 = srt[math.floor(len(srt) * 0.67)]
        labels = ["calm" if r < p33 else ("trans" if r < p67 else "stress") for r in rhos]
        moves = []
        for i in range(1, len(diagrams)):
            if labels[i] != "calm":
                continue
            moves.append(wasserstein1(diagrams[i - 1]["h0"] + diagrams[i - 1]["h1"], diagrams[i]["h0"] + diagrams[i]["h1"]))
        drift = mean(moves)
        flips = calm = 0
        for i in range(2, len(labels) - 2):
            around = [labels[i - 2], labels[i - 1], labels[i + 1], labels[i + 2]]
            if sum(1 for l in around if l == "calm") < 3:
                continue
            calm += 1
            if labels[i] != "calm":
                flips += 1
        false_alarm = flips / calm if calm else 0
        results.append({"win": win, "drift": drift, "stability": 1 / drift if drift else 0,
                        "falseAlarm": false_alarm, "windows": len(rhos), "p33": p33, "p67": p67})
    eligible = [r for r in results if r["falseAlarm"] <= false_alarm_target]
    chosen = sorted(eligible or results, key=lambda r: -r["stability"])[0]
    return {"target": false_alarm_target, "results": results, "chosen": chosen["win"], "chosenRow": chosen}


# ---------- candidate 5: surrogate gate ----------
def _imul(a, b):
    return (a * b) & M32


def mulberry(seed):
    """mulberry32, bit for bit: the same seed draws the same numbers as the original."""
    state = [seed & M32]

    def rnd():
        s = (state[0] + 0x6D2B79F5) & M32
        state[0] = s
        t = _imul(s ^ (s >> 15), 1 | s)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rnd


def phase_randomise(series, rand):
    """Keep each frequency's amplitude, draw a fresh phase, restore Hermitian symmetry."""
    x = np.asarray(series, dtype=float)
    n = len(x)
    X = np.fft.fft(x)
    amp = np.abs(X)
    Y = np.zeros(n, dtype=complex)
    Y[0] = X[0].real
    half = n // 2
    for k in range(1, half + 1):
        phi = rand() * 2 * math.pi
        r, i2 = amp[k] * math.cos(phi), amp[k] * math.sin(phi)
        if n - k != k:
            Y[k] = complex(r, i2)
            Y[n - k] = complex(r, -i2)
        else:
            Y[k] = complex(r, 0.0)
    return np.fft.ifft(Y).real


def surrogate_test(sectors, dates, win=60, n=200, end=None, seed=7):
    R = np.array([an.log_rets(s["c"]) for s in sectors])
    last = R.shape[1] - 1 if end is None else end
    obs_m = corr_matrix(R, last, win)
    obs_ph = persistence(obs_m["D"])
    observed = {"rho": obs_m["rho"], "l1": landscape_l1(obs_ph["h1"]),
                "loops": sum(1 for b in obs_ph["h1"] if b["d"] - b["b"] > 0.02)}
    rand = mulberry(seed)
    seg = R[:, last - win + 1:last + 1]
    null_rho, null_l1 = [], []
    for _ in range(n):
        sur = np.array([phase_randomise(x, rand) for x in seg])
        C = an.corr_matrix_np(sur)
        D = np.sqrt(np.maximum(0.0, 2 * (1 - C)))
        np.fill_diagonal(D, 0.0)
        null_rho.append(an.mean_pair_rho(C))
        null_l1.append(landscape_l1(persistence(D.tolist())["h1"]))

    def pct(arr, v):
        return sum(1 for x in arr if x <= v) / len(arr)

    p_rho = 1 - pct(null_rho, observed["rho"])
    p_l1 = min(pct(null_l1, observed["l1"]), 1 - pct(null_l1, observed["l1"])) * 2
    m = mean(null_rho)
    return {
        "date": dates[last + 1] if last + 1 < len(dates) else dates[-1],
        "window": win, "surrogates": n,
        "observed": observed,
        "nullRho": {"mean": m, "sd": math.sqrt(mean([(x - m) ** 2 for x in null_rho])), "values": null_rho},
        "nullL1": {"mean": mean(null_l1), "values": null_l1},
        "pRho": p_rho, "pL1": p_l1,
        "verdict": "real" if p_rho < 0.05 else ("weak" if p_rho < 0.2 else "noise"),
    }


def shift_test(sectors, dates, win=60, n=300, end=None, seed=11, block=5):
    """The stricter null: resample joint return rows (blocks of 5) from the PREVIOUS window,
    which keeps its correlation structure, and ask how often it produces today's reading."""
    R = np.array([an.log_rets(s["c"]) for s in sectors])
    last = R.shape[1] - 1 if end is None else end
    prev_end = last - win
    if prev_end - win + 1 < 0:
        return None
    now = corr_matrix(R, last, win)
    prev = corr_matrix(R, prev_end, win)
    pool = R[:, prev_end - win + 1:prev_end + 1].T  # joint rows of the previous window
    rand = mulberry(seed)
    nulls = []
    for _ in range(n):
        idx = []
        while len(idx) < win:
            start = math.floor(rand() * len(pool))
            for b in range(block):
                if len(idx) >= win:
                    break
                idx.append((start + b) % len(pool))
        nulls.append(an.mean_pair_rho(an.corr_matrix_np(pool[idx].T)))
    srt = sorted(nulls)
    below = sum(1 for x in nulls if x <= now["rho"]) / len(nulls)
    p = 2 * min(below, 1 - below)
    return {
        "windowEnd": dates[last + 1] if last + 1 < len(dates) else dates[-1],
        "previousEnd": dates[prev_end + 1],
        "observed": now["rho"], "previous": prev["rho"],
        "nullMean": mean(nulls),
        "nullLo": srt[math.floor(len(nulls) * 0.025)],
        "nullHi": srt[math.floor(len(nulls) * 0.975)],
        "values": nulls,
        "p": p, "shifted": p < 0.05,
    }


# ---------- candidate 7: implied-volatility surface topology ----------
def ncdf(x):
    t = 1 / (1 + 0.2316419 * abs(x))
    d = 0.3989422804 * math.exp(-x * x / 2)
    p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    return 1 - p if x > 0 else p


RATE = 0.065


def bs(typ, S, K, T, v):
    if T <= 0 or v <= 0:
        return max(0.0, S - K if typ == "C" else K - S)
    sq = v * math.sqrt(T)
    d1 = (math.log(S / K) + (RATE + v * v / 2) * T) / sq
    d2 = d1 - sq
    if typ == "C":
        return S * ncdf(d1) - K * math.exp(-RATE * T) * ncdf(d2)
    return K * math.exp(-RATE * T) * ncdf(-d2) - S * ncdf(-d1)


def implied_vol(typ, price, S, K, T):
    intrinsic = max(0.0, S - K if typ == "C" else K - S)
    if price is None or not (price > intrinsic + 0.05) or T <= 0:
        return None
    lo, hi = 0.01, 3.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if bs(typ, S, K, T, mid) > price:
            hi = mid
        else:
            lo = mid
    v = (lo + hi) / 2
    return v if 0.02 < v < 2.9 else None


def cubical_h0(grid):
    """Sublevel-set persistence of a 2-D grid (cubical complex, H0): the basins of the surface."""
    rows, cols = len(grid), len(grid[0])
    cells = [(grid[r][c], r, c) for r in range(rows) for c in range(cols) if grid[r][c] is not None]
    cells.sort(key=lambda x: x[0])
    ident = [-1] * (rows * cols)
    par, birth, rep = [], [], []

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    bars = []
    for v, r, c in cells:
        me = len(par)
        par.append(me)
        birth.append(v)
        rep.append([r, c])
        ident[r * cols + c] = me
        root = me
        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if nr < 0 or nc < 0 or nr >= rows or nc >= cols:
                continue
            other = ident[nr * cols + nc]
            if other < 0:
                continue
            a, b = find(root), find(other)
            if a == b:
                continue
            young = a if birth[a] > birth[b] else b  # the younger component dies here
            old = b if young == a else a
            bars.append({"birth": birth[young], "death": v, "at": rep[young]})
            par[young] = old
            root = old
    alive = []
    for i in range(len(par)):
        f = find(i)
        if f not in alive:
            alive.append(f)
    essential = [{"birth": birth[i], "death": None, "at": rep[i]} for i in alive]
    return {"bars": [b for b in bars if b["death"] > b["birth"]], "essential": essential}


def _days(iso):
    return date.fromisoformat(iso).toordinal()


def iv_surface(fo, max_expiries=5, width_pct=0.08):
    """Strike x expiry implied-volatility surface from an end-of-day option chain."""
    if not fo or not fo.get("expiries"):
        return None
    trade = _days(fo["tradeDate"])
    expiries = sorted(e for e in fo["expiries"] if _days(e) > trade)[:max_expiries]
    if not expiries:
        return None
    und = fo["und"]
    strikes = set()
    by_expiry = {}
    for e in expiries:
        T = (_days(e) - trade) / 365
        mp = {}
        for row in fo["expiries"][e]:
            if row["K"] is None or abs(row["K"] - und) > und * width_pct:
                continue
            typ = "C" if row["t"] == "CE" else "P"
            if (typ == "C" and row["K"] < und) or (typ == "P" and row["K"] > und):
                continue  # use the out-of-the-money side: it prices best
            iv = implied_vol(typ, row["ltp"], und, row["K"], T)
            if iv is None:
                continue
            mp[row["K"]] = iv
            strikes.add(row["K"])
        by_expiry[e] = {"T": T, "map": mp}
    ks = sorted(strikes)
    if len(ks) < 5:
        return None
    grid = [[by_expiry[e]["map"].get(k) for k in ks] for e in expiries]
    for row in grid:  # fill small gaps along each expiry so the complex is connected
        for i in range(len(row)):
            if row[i] is not None:
                continue
            left, right = i - 1, i + 1
            while left >= 0 and row[left] is None:
                left -= 1
            while right < len(row) and row[right] is None:
                right += 1
            if left >= 0 and right < len(row):
                row[i] = (row[left] + row[right]) / 2
            elif left >= 0:
                row[i] = row[left]
            elif right < len(row):
                row[i] = row[right]
    ph = cubical_h0(grid)
    significant = [b for b in ph["bars"] if b["death"] - b["birth"] > 0.005]
    flat = [v for row in grid for v in row if v is not None]
    bars = sorted(ph["bars"], key=lambda b: -(b["death"] - b["birth"]))[:12]
    return {
        "tradeDate": fo["tradeDate"], "underlying": und,
        "expiries": expiries, "days": [js_round(_days(e) - trade) for e in expiries],
        "strikes": ks, "grid": grid,
        "bars": bars,
        "basins": len(significant) + len(ph["essential"]),
        "essential": ph["essential"],
        "minIv": min(flat), "maxIv": max(flat),
    }
