'use strict';
// Working prototypes of the seven patent candidates, on real data.
//   1 streaming update        — lib/patents.js (streamBench) + the client's incremental loop
//   2 attribution             — client (ranked drivers from these correlations)
//   3 bifiltration            — client (Hilbert function over correlation × realised volatility)
//   4 self-calibration        — calibrate()
//   5 surrogate gate          — surrogateTest()
//   6 cross-asset contagion   — layer series prepared in lib/eod.js, tracked on the client
//   7 IV-surface topology     — ivSurface() + cubicalH0()

const an = require('./analytics');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/* ---------- persistence on a distance matrix (same algorithm as the client) ---------- */
function symdiff(a, b) {
  const o = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) o.push(a[i++]);
    else if (a[i] > b[j]) o.push(b[j++]);
    else { i++; j++; }
  }
  while (i < a.length) o.push(a[i++]);
  while (j < b.length) o.push(b[j++]);
  return o;
}

function persistence(D) {
  const n = D.length, E = [];
  let i, j, k;
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) E.push({ i, j, d: D[i][j] });
  E.sort((a, b) => a.d - b.d);
  const eid = new Int32Array(n * n);
  E.forEach((e, x) => { eid[e.i * n + e.j] = x; eid[e.j * n + e.i] = x; });
  const par = [];
  for (i = 0; i < n; i++) par.push(i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const h0 = [];
  for (k = 0; k < E.length; k++) {
    const a = find(E[k].i), b = find(E[k].j);
    if (a !== b) { par[a] = b; h0.push({ b: 0, d: E[k].d }); }
  }
  const T = [];
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) {
    T.push([eid[i * n + j], eid[i * n + k], eid[j * n + k]].sort((x, y) => x - y));
  }
  T.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const pivot = new Int32Array(E.length).fill(-1), R = [], h1 = [];
  for (const t of T) {
    let c = t;
    const death = E[t[2]].d;
    while (c.length) { const p = pivot[c[c.length - 1]]; if (p < 0) break; c = symdiff(c, R[p]); }
    if (c.length) {
      const low = c[c.length - 1];
      pivot[low] = R.length; R.push(c);
      const birth = E[low].d;
      if (death - birth > 1e-9) h1.push({ b: birth, d: death });
    }
  }
  return { h0, h1, edges: E.length };
}

const landscapeL1 = (bars) => bars.reduce((s, b) => s + (b.d - b.b) * (b.d - b.b) / 4, 0);

function corrMatrix(R, end, win) {
  const n = R.length, seg = R.map((r) => r.slice(end - win + 1, end + 1));
  const D = [];
  for (let i = 0; i < n; i++) D.push(new Array(n).fill(0));
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const c = an.corr(seg[i], seg[j]);
    D[i][j] = D[j][i] = an.dist(c);
    sum += c; cnt++;
  }
  return { D, rho: sum / cnt };
}

/* ---------- candidate 4: self-calibrating window ---------- */
// For each candidate window length, measure how stable consecutive persistence diagrams are
// during quiet stretches (1-Wasserstein between H0+H1 bars) and how often the regime label
// flips against its own 5-day median. Pick the most stable window that stays under the
// false-alarm target.
function wasserstein1(a, b) {
  const x = a.map((p) => p.d - p.b).sort((p, q) => q - p);
  const y = b.map((p) => p.d - p.b).sort((p, q) => q - p);
  const n = Math.max(x.length, y.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((x[i] || 0) - (y[i] || 0));
  return s;
}

function calibrate(sectors, dates, opts = {}) {
  const windows = opts.windows || [20, 30, 40, 60, 80, 100, 120];
  const target = opts.falseAlarmTarget == null ? 0.05 : opts.falseAlarmTarget;
  const R = sectors.map((s) => an.logRets(s.c));
  const results = windows.map((win) => {
    const rhos = [], diagrams = [];
    for (let end = win - 1; end < R[0].length; end++) {
      const { D, rho } = corrMatrix(R, end, win);
      rhos.push(rho);
      diagrams.push(persistence(D));
    }
    const sorted = rhos.slice().sort((a, b) => a - b);
    const p33 = sorted[Math.floor(sorted.length * 0.33)], p67 = sorted[Math.floor(sorted.length * 0.67)];
    const label = (r) => (r < p33 ? 'calm' : r < p67 ? 'trans' : 'stress');
    const labels = rhos.map(label);
    // stability: average diagram movement from one session to the next, in calm stretches only
    const moves = [];
    for (let i = 1; i < diagrams.length; i++) {
      if (labels[i] !== 'calm') continue;
      moves.push(wasserstein1(diagrams[i - 1].h0.concat(diagrams[i - 1].h1), diagrams[i].h0.concat(diagrams[i].h1)));
    }
    const drift = mean(moves);
    // false alarms: label flips away from the local median label during calm stretches
    let flips = 0, calm = 0;
    for (let i = 2; i < labels.length - 2; i++) {
      const around = [labels[i - 2], labels[i - 1], labels[i + 1], labels[i + 2]];
      const calmAround = around.filter((l) => l === 'calm').length >= 3;
      if (!calmAround) continue;
      calm++;
      if (labels[i] !== 'calm') flips++;
    }
    const falseAlarm = calm ? flips / calm : 0;
    return { win, drift, stability: drift ? 1 / drift : 0, falseAlarm, windows: rhos.length, p33, p67 };
  });
  const eligible = results.filter((r) => r.falseAlarm <= target);
  const chosen = (eligible.length ? eligible : results).slice().sort((a, b) => b.stability - a.stability)[0];
  return { target, results, chosen: chosen.win, chosenRow: chosen };
}

/* ---------- candidate 5: surrogate gate ---------- */
// Phase-randomised surrogates keep each sector's own volatility and autocorrelation but destroy
// the correlation structure between sectors. If the observed statistic sits inside that null,
// the "shift" is noise and nothing should fire.
function dft(x) {
  const n = x.length, re = new Array(n).fill(0), im = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = -2 * Math.PI * k * t / n;
      re[k] += x[t] * Math.cos(a);
      im[k] += x[t] * Math.sin(a);
    }
  }
  return { re, im };
}
function idftReal(re, im) {
  const n = re.length, out = new Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    let s = 0;
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * k * t / n;
      s += re[k] * Math.cos(a) - im[k] * Math.sin(a);
    }
    out[t] = s / n;
  }
  return out;
}
function phaseRandomise(series, rand) {
  const n = series.length, { re, im } = dft(series);
  const amp = re.map((r, k) => Math.hypot(r, im[k]));
  const nre = new Array(n).fill(0), nim = new Array(n).fill(0);
  nre[0] = re[0]; nim[0] = 0;
  const half = Math.floor(n / 2);
  for (let k = 1; k <= half; k++) {
    const phi = rand() * 2 * Math.PI;
    const r = amp[k] * Math.cos(phi), i2 = amp[k] * Math.sin(phi);
    nre[k] = r; nim[k] = i2;
    if (n - k !== k) { nre[n - k] = r; nim[n - k] = -i2; }
    else { nim[k] = 0; }
  }
  return idftReal(nre, nim);
}
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surrogateTest(sectors, dates, { win = 60, n = 200, end = null, seed = 7 } = {}) {
  const R = sectors.map((s) => an.logRets(s.c));
  const last = end == null ? R[0].length - 1 : end;
  const obsM = corrMatrix(R, last, win);
  const obsPh = persistence(obsM.D);
  const observed = { rho: obsM.rho, l1: landscapeL1(obsPh.h1), loops: obsPh.h1.filter((b) => b.d - b.b > 0.02).length };
  const rand = mulberry(seed);
  const seg = R.map((r) => r.slice(last - win + 1, last + 1));
  const nullRho = [], nullL1 = [];
  for (let s = 0; s < n; s++) {
    const sur = seg.map((x) => phaseRandomise(x, rand));
    const D = [];
    for (let i = 0; i < sur.length; i++) D.push(new Array(sur.length).fill(0));
    let sum = 0, cnt = 0;
    for (let i = 0; i < sur.length; i++) for (let j = i + 1; j < sur.length; j++) {
      const c = an.corr(sur[i], sur[j]);
      D[i][j] = D[j][i] = an.dist(c);
      sum += c; cnt++;
    }
    nullRho.push(sum / cnt);
    nullL1.push(landscapeL1(persistence(D).h1));
  }
  const pct = (arr, v) => arr.filter((x) => x <= v).length / arr.length;
  const pRho = 1 - pct(nullRho, observed.rho);
  const pL1 = Math.min(pct(nullL1, observed.l1), 1 - pct(nullL1, observed.l1)) * 2;
  return {
    date: dates[last + 1] || dates[dates.length - 1],
    window: win, surrogates: n,
    observed,
    nullRho: { mean: mean(nullRho), sd: Math.sqrt(mean(nullRho.map((x) => (x - mean(nullRho)) ** 2))), values: nullRho },
    nullL1: { mean: mean(nullL1), values: nullL1 },
    pRho, pL1,
    verdict: pRho < 0.05 ? 'real' : pRho < 0.2 ? 'weak' : 'noise',
  };
}

/* ---------- candidate 7: implied-volatility surface topology ---------- */
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}
const RATE = 0.065;
function bs(type, S, K, T, v) {
  if (T <= 0 || v <= 0) return Math.max(0, type === 'C' ? S - K : K - S);
  const sq = v * Math.sqrt(T), d1 = (Math.log(S / K) + (RATE + v * v / 2) * T) / sq, d2 = d1 - sq;
  return type === 'C' ? S * ncdf(d1) - K * Math.exp(-RATE * T) * ncdf(d2) : K * Math.exp(-RATE * T) * ncdf(-d2) - S * ncdf(-d1);
}
function impliedVol(type, price, S, K, T) {
  const intrinsic = Math.max(0, type === 'C' ? S - K : K - S);
  if (!(price > intrinsic + 0.05) || T <= 0) return null;
  let lo = 0.01, hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bs(type, S, K, T, mid) > price) hi = mid; else lo = mid;
  }
  const v = (lo + hi) / 2;
  return v > 0.02 && v < 2.9 ? v : null;
}

// Sublevel-set persistence of a 2-D grid (cubical complex, H0): basins of the surface.
function cubicalH0(grid) {
  const rows = grid.length, cols = grid[0].length, cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] != null) cells.push([grid[r][c], r, c]);
  cells.sort((a, b) => a[0] - b[0]);
  const id = new Int32Array(rows * cols).fill(-1);
  const par = [], birth = [], rep = [];
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const bars = [];
  for (const [v, r, c] of cells) {
    const me = par.length;
    par.push(me); birth.push(v); rep.push([r, c]);
    id[r * cols + c] = me;
    let root = me;
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of nb) {
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const other = id[nr * cols + nc];
      if (other < 0) continue;
      const a = find(root), b = find(other);
      if (a === b) continue;
      // the younger component dies here
      const young = birth[a] > birth[b] ? a : b, old = young === a ? b : a;
      bars.push({ birth: birth[young], death: v, at: rep[young] });
      par[young] = old;
      root = old;
    }
  }
  const alive = new Set();
  for (let i = 0; i < par.length; i++) alive.add(find(i));
  const essential = [...alive].map((i) => ({ birth: birth[i], death: null, at: rep[i] }));
  return { bars: bars.filter((b) => b.death > b.birth), essential };
}

// Build the strike × expiry implied-volatility surface from an end-of-day option chain.
function ivSurface(fo, { maxExpiries = 5, widthPct = 0.08 } = {}) {
  if (!fo || !fo.expiries) return null;
  const tradeDate = new Date(fo.tradeDate + 'T00:00:00Z').getTime();
  const expiries = Object.keys(fo.expiries).filter((e) => new Date(e + 'T00:00:00Z').getTime() > tradeDate)
    .sort().slice(0, maxExpiries);
  if (!expiries.length) return null;
  const und = fo.und;
  const strikes = new Set();
  const byExpiry = {};
  for (const e of expiries) {
    const T = (new Date(e + 'T00:00:00Z').getTime() - tradeDate) / 864e5 / 365;
    const map = {};
    for (const row of fo.expiries[e]) {
      if (Math.abs(row.K - und) > und * widthPct) continue;
      const type = row.t === 'CE' ? 'C' : 'P';
      // use the out-of-the-money side: it prices best
      if ((type === 'C' && row.K < und) || (type === 'P' && row.K > und)) continue;
      const iv = impliedVol(type, row.ltp, und, row.K, T);
      if (iv == null) continue;
      map[row.K] = iv;
      strikes.add(row.K);
    }
    byExpiry[e] = { T, map };
  }
  const ks = [...strikes].sort((a, b) => a - b);
  if (ks.length < 5) return null;
  const grid = expiries.map((e) => ks.map((k) => (byExpiry[e].map[k] == null ? null : byExpiry[e].map[k])));
  // fill small gaps along each expiry row so the complex is connected
  grid.forEach((row) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] != null) continue;
      let left = i - 1, right = i + 1;
      while (left >= 0 && row[left] == null) left--;
      while (right < row.length && row[right] == null) right++;
      if (left >= 0 && right < row.length) row[i] = (row[left] + row[right]) / 2;
      else if (left >= 0) row[i] = row[left];
      else if (right < row.length) row[i] = row[right];
    }
  });
  const ph = cubicalH0(grid);
  const significant = ph.bars.filter((b) => b.death - b.birth > 0.005);
  return {
    tradeDate: fo.tradeDate, underlying: und,
    expiries, days: expiries.map((e) => Math.round((new Date(e + 'T00:00:00Z').getTime() - tradeDate) / 864e5)),
    strikes: ks, grid,
    bars: ph.bars.sort((a, b) => (b.death - b.birth) - (a.death - a.birth)).slice(0, 12),
    basins: significant.length + ph.essential.length,
    essential: ph.essential,
    minIv: Math.min.apply(null, grid.flat().filter((v) => v != null)),
    maxIv: Math.max.apply(null, grid.flat().filter((v) => v != null)),
  };
}

// The stricter null for candidate 5: has the structure actually CHANGED?
// Resample joint return rows (blocks of 5 sessions) from the PREVIOUS window, which keeps that
// window's cross-sectional correlation intact, and ask how often it produces today's reading.
function shiftTest(sectors, dates, { win = 60, n = 300, end = null, seed = 11, block = 5 } = {}) {
  const R = sectors.map((s) => an.logRets(s.c));
  const last = end == null ? R[0].length - 1 : end;
  const prevEnd = last - win;
  if (prevEnd - win + 1 < 0) return null;
  const now = corrMatrix(R, last, win);
  const prev = corrMatrix(R, prevEnd, win);
  const pool = [];                       // joint rows of the previous window
  for (let t = prevEnd - win + 1; t <= prevEnd; t++) pool.push(R.map((r) => r[t]));
  const rand = mulberry(seed);
  const nulls = [];
  for (let s = 0; s < n; s++) {
    const rows = [];
    while (rows.length < win) {
      const start = Math.floor(rand() * pool.length);
      for (let b = 0; b < block && rows.length < win; b++) rows.push(pool[(start + b) % pool.length]);
    }
    const series = R.map((_, i) => rows.map((row) => row[i]));
    let sum = 0, cnt = 0;
    for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) { sum += an.corr(series[i], series[j]); cnt++; }
    nulls.push(sum / cnt);
  }
  const sorted = nulls.slice().sort((a, b) => a - b);
  const below = nulls.filter((x) => x <= now.rho).length / nulls.length;
  const p = 2 * Math.min(below, 1 - below);
  return {
    windowEnd: dates[last + 1] || dates[dates.length - 1],
    previousEnd: dates[prevEnd + 1],
    observed: now.rho,
    previous: prev.rho,
    nullMean: mean(nulls),
    nullLo: sorted[Math.floor(nulls.length * 0.025)],
    nullHi: sorted[Math.floor(nulls.length * 0.975)],
    values: nulls,
    p,
    shifted: p < 0.05,
  };
}

module.exports = { persistence, corrMatrix, landscapeL1, calibrate, surrogateTest, shiftTest, ivSurface, cubicalH0, impliedVol };
