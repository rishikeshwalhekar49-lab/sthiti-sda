'use strict';
// Correlation/topology metrics, regime-conditioned backtests and portfolio fragility.
// Everything here runs on the end-of-day history already downloaded by lib/eod.js.

const ind = require('./ind');

const WIN = 60;              // trading days in a correlation window
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function logRets(c) { const r = []; for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1])); return r; }

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const A = a.slice(-n), B = b.slice(-n), ma = mean(A), mb = mean(B);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = A[i] - ma, y = B[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  const d = Math.sqrt(va * vb);
  return d ? Math.max(-1, Math.min(1, cov / d)) : 0;
}
const dist = (rho) => Math.sqrt(Math.max(0, 2 * (1 - rho)));

/* ---------- mean sector correlation per day (the regime series) ---------- */
function regimeSeries(sectors, dates) {
  const R = sectors.map((s) => logRets(s.c));
  const out = [];
  for (let end = WIN - 1; end < R[0].length; end++) {
    const seg = R.map((r) => r.slice(end - WIN + 1, end + 1));
    let sum = 0, n = 0;
    for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) { sum += corr(seg[i], seg[j]); n++; }
    out.push({ date: dates[end + 1], rho: sum / n });
  }
  const sorted = out.map((o) => o.rho).slice().sort((a, b) => a - b);
  const p33 = sorted[Math.floor(sorted.length * 0.33)], p67 = sorted[Math.floor(sorted.length * 0.67)];
  const label = (rho) => (rho < p33 ? 'calm' : rho < p67 ? 'trans' : 'stress');
  const byDate = {};
  out.forEach((o) => { byDate[o.date] = label(o.rho); });
  return { series: out, p33, p67, byDate, label };
}

/* ---------- per-stock topology metrics (Topo-Screen) ---------- */
// dist: correlation distance from the market's centre — high means topologically isolated.
// corrChg: how much the stock's average correlation with the market has changed in a month.
function universeMetrics(symbols, retsBySym, niftyRets) {
  const syms = symbols.filter((s) => (retsBySym[s] || []).length >= WIN);
  const recent = {}, prior = {};
  syms.forEach((s) => { const r = retsBySym[s]; recent[s] = r.slice(-30); prior[s] = r.slice(-60, -30); });
  const out = {};
  const nRecent = niftyRets.slice(-30);
  for (const s of syms) {
    let sum = 0, sumPrev = 0, n = 0;
    for (const t of syms) {
      if (t === s) continue;
      sum += corr(recent[s], recent[t]);
      sumPrev += corr(prior[s], prior[t]);
      n++;
    }
    const avg = sum / n, avgPrev = sumPrev / n;
    out[s] = {
      avgCorr: avg,
      dist: dist(avg),
      corrChg: avg - avgPrev,
      corrMkt: corr(recent[s], nRecent),
    };
  }
  return out;
}

/* ---------- regime-conditioned backtests ---------- */
// Entries and exits both fill at the next session's close, so no bar is used before it exists.
const STRATEGIES = {
  golden: { name: 'Golden cross (50-day over 200-day)', hold: 60 },
  rsi30: { name: 'RSI(14) drops below 30', hold: 20 },
  break52: { name: 'New 52-week high', hold: 20 },
};

function rollingSma(a, n) {
  const out = new Array(a.length).fill(null);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i];
    if (i >= n) sum -= a[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// highest high over the previous `n` bars (not counting the current one)
function rollingMaxPrev(a, n) {
  const out = new Array(a.length).fill(null), dq = [];
  for (let i = 0; i < a.length; i++) {
    out[i] = dq.length ? a[dq[0]] : null;
    while (dq.length && a[dq[dq.length - 1]] <= a[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - n) dq.shift();
  }
  return out;
}

function backtestSymbol(key, closes, highs, dates) {
  const n = closes.length, trades = [];
  if (n < 260) return trades;
  const r = ind.rsi(closes);
  const s50 = key === 'golden' ? rollingSma(closes, 50) : null;
  const s200 = key === 'golden' ? rollingSma(closes, 200) : null;
  const hi250 = key === 'break52' ? rollingMaxPrev(highs, 250) : null;
  let open = null;
  for (let i = 205; i < n - 1; i++) {
    if (open) {
      let exit = false;
      if (key === 'golden') exit = (s50[i] < s200[i]) || (i - open.i >= STRATEGIES.golden.hold);
      else if (key === 'rsi30') exit = r[i] > 50 || i - open.i >= STRATEGIES.rsi30.hold;
      else exit = i - open.i >= STRATEGIES.break52.hold || closes[i] < open.px * 0.92;
      if (exit) {
        const px = closes[i + 1];
        trades.push({ entry: open.date, exit: dates[i + 1], ret: (px / open.px - 1) * 100, bars: i + 1 - open.i });
        open = null;
      }
      continue;
    }
    let signal = false;
    if (key === 'golden') signal = s50[i] != null && s200[i] != null && s50[i] > s200[i] && s50[i - 1] <= s200[i - 1];
    else if (key === 'rsi30') signal = r[i] != null && r[i - 1] != null && r[i] < 30 && r[i - 1] >= 30;
    else signal = hi250[i] != null && closes[i] > hi250[i];
    if (signal) open = { i: i + 1, px: closes[i + 1], date: dates[i + 1] };
  }
  return trades;
}

function runBacktests(universe, regimeByDate) {
  const out = {};
  for (const key of Object.keys(STRATEGIES)) {
    const rows = [];
    for (const u of universe) {
      for (const t of backtestSymbol(key, u.closes, u.highs, u.dates)) {
        rows.push({ sym: u.sym, entry: t.entry, exit: t.exit, ret: Math.round(t.ret * 100) / 100, bars: t.bars, regime: regimeByDate[t.entry] || null });
      }
    }
    out[key] = { name: STRATEGIES[key].name, trades: rows };
  }
  return out;
}

/* ---------- portfolio fragility ---------- */
function portfolioReport(holdings, retsBySym, meta) {
  const rows = holdings.filter((h) => (retsBySym[h.sym] || []).length >= 30);
  const missing = holdings.filter((h) => !(retsBySym[h.sym] || []).length).map((h) => h.sym);
  if (rows.length < 2) return { error: 'Need at least two holdings with price history.', missing };
  const totalW = rows.reduce((s, h) => s + h.weight, 0) || 1;
  rows.forEach((h) => { h.w = h.weight / totalW; });
  const n = rows.length, R = rows.map((h) => retsBySym[h.sym].slice(-WIN));
  const C = [], D = [];
  for (let i = 0; i < n; i++) { C.push(new Array(n).fill(1)); D.push(new Array(n).fill(0)); }
  let wsum = 0, psum = 0, pn = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const c = corr(R[i], R[j]);
    C[i][j] = C[j][i] = c;
    D[i][j] = D[j][i] = dist(c);
    wsum += 2 * rows[i].w * rows[j].w * c;
    psum += c; pn++;
  }
  const meanRho = psum / pn;
  const own = rows.reduce((s, h) => s + h.w * h.w, 0);
  const effN = 1 / (own + wsum);          // effective number of independent positions
  // single-linkage clusters at correlation 0.6 and above
  const parent = rows.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (C[i][j] >= 0.6) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  const groups = new Map();
  rows.forEach((h, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const clusters = [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const w = g.reduce((s, i) => s + rows[i].w, 0);
    const sectors = [...new Set(g.map((i) => (meta[rows[i].sym] || {}).industry).filter(Boolean))];
    let inner = 0, cnt = 0;
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) { inner += C[g[a]][g[b]]; cnt++; }
    return { members: g.map((i) => rows[i].sym), weight: w, sectors, meanRho: cnt ? inner / cnt : 1 };
  }).sort((a, b) => b.weight - a.weight);
  const perHolding = rows.map((h, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) if (j !== i) s += C[i][j];
    return { sym: h.sym, weight: h.w, avgRho: s / (n - 1), name: (meta[h.sym] || {}).name || h.sym, industry: (meta[h.sym] || {}).industry || '' };
  }).sort((a, b) => b.avgRho - a.avgRho);
  return { symbols: rows.map((h) => h.sym), weights: rows.map((h) => h.w), D, meanRho, effN, clusters, perHolding, missing, window: WIN };
}

module.exports = { WIN, logRets, corr, dist, regimeSeries, universeMetrics, runBacktests, portfolioReport, STRATEGIES };
