'use strict';
// Technical indicators on plain arrays (oldest first).

function sma(a, n, i = a.length - 1) {
  if (i - n + 1 < 0) return null;
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += a[j];
  return s / n;
}

function rsi(c, n = 14) {
  const out = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function atr(h, l, c, n = 14) {
  if (c.length <= n) return null;
  const tr = [];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  let a = tr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

// Beta of a stock against an index from aligned close arrays (nulls allowed).
function beta(sc, ic, n = 250) {
  const rs = [], ri = [];
  for (let i = Math.max(1, sc.length - n); i < sc.length; i++) {
    if (sc[i] == null || sc[i - 1] == null || ic[i] == null || ic[i - 1] == null) continue;
    rs.push(Math.log(sc[i] / sc[i - 1]));
    ri.push(Math.log(ic[i] / ic[i - 1]));
  }
  if (rs.length < 60) return null;
  const ms = rs.reduce((s, v) => s + v, 0) / rs.length, mi = ri.reduce((s, v) => s + v, 0) / ri.length;
  let cov = 0, vi = 0;
  for (let k = 0; k < rs.length; k++) { cov += (rs[k] - ms) * (ri[k] - mi); vi += (ri[k] - mi) ** 2; }
  return vi ? cov / vi : null;
}

// Double bottom: two lows within 3%, at least 10 bars apart, a peak 6%+ above them,
// and the latest close breaking above that peak (the neckline).
function doubleBottom(c) {
  if (c.length < 60) return null;
  const w = c.slice(-60), n = w.length, mins = [];
  for (let i = 3; i < n - 4; i++) {
    let ok = true;
    for (let j = i - 3; j <= i + 3; j++) if (w[j] < w[i]) { ok = false; break; }
    if (ok) mins.push(i);
  }
  for (let a = 0; a < mins.length; a++) for (let b = a + 1; b < mins.length; b++) {
    const i = mins[a], j = mins[b];
    if (j - i < 10 || j > n - 3) continue;
    const lo1 = w[i], lo2 = w[j];
    if (Math.abs(lo1 - lo2) / Math.min(lo1, lo2) > 0.03) continue;
    const neck = Math.max(...w.slice(i, j + 1));
    if (neck < Math.max(lo1, lo2) * 1.06) continue;
    if (w[n - 1] > neck && w[n - 2] <= neck) return { neck, lows: [lo1, lo2] };
  }
  return null;
}

module.exports = { sma, rsi, atr, beta, doubleBottom };
