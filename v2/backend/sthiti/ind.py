"""Technical indicators on plain lists (oldest first). Port of lib/ind.js."""
import math


def sma(a, n, i=None):
    if i is None:
        i = len(a) - 1
    if i - n + 1 < 0:
        return None
    s = 0.0
    for j in range(i - n + 1, i + 1):
        s += a[j]
    return s / n


def rsi(c, n=14):
    out = [None] * len(c)
    if len(c) <= n:
        return out
    g = l = 0.0
    for i in range(1, n + 1):
        d = c[i] - c[i - 1]
        if d > 0:
            g += d
        else:
            l -= d
    g /= n
    l /= n
    out[n] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(n + 1, len(c)):
        d = c[i] - c[i - 1]
        g = (g * (n - 1) + max(d, 0)) / n
        l = (l * (n - 1) + max(-d, 0)) / n
        out[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def atr(h, l, c, n=14):
    if len(c) <= n:
        return None
    tr = [max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])) for i in range(1, len(c))]
    a = sum(tr[:n]) / n
    for i in range(n, len(tr)):
        a = (a * (n - 1) + tr[i]) / n
    return a


def beta(sc, ic, n=250):
    """Beta of a stock against an index from aligned close lists (None allowed)."""
    rs, ri = [], []
    for i in range(max(1, len(sc) - n), len(sc)):
        if sc[i] is None or sc[i - 1] is None or ic[i] is None or ic[i - 1] is None:
            continue
        rs.append(math.log(sc[i] / sc[i - 1]))
        ri.append(math.log(ic[i] / ic[i - 1]))
    if len(rs) < 60:
        return None
    ms, mi = sum(rs) / len(rs), sum(ri) / len(ri)
    cov = vi = 0.0
    for k in range(len(rs)):
        cov += (rs[k] - ms) * (ri[k] - mi)
        vi += (ri[k] - mi) ** 2
    return cov / vi if vi else None


def double_bottom(c):
    """Two lows within 3%, 10+ bars apart, a peak 6%+ above them, and the latest close
    breaking above that peak (the neckline)."""
    if len(c) < 60:
        return None
    w = c[-60:]
    n = len(w)
    mins = []
    for i in range(3, n - 4):
        if all(w[j] >= w[i] for j in range(i - 3, i + 4)):
            mins.append(i)
    for a in range(len(mins)):
        for b in range(a + 1, len(mins)):
            i, j = mins[a], mins[b]
            if j - i < 10 or j > n - 3:
                continue
            lo1, lo2 = w[i], w[j]
            if abs(lo1 - lo2) / min(lo1, lo2) > 0.03:
                continue
            neck = max(w[i:j + 1])
            if neck < max(lo1, lo2) * 1.06:
                continue
            if w[n - 1] > neck and w[n - 2] <= neck:
                return {"neck": neck, "lows": [lo1, lo2]}
    return None
