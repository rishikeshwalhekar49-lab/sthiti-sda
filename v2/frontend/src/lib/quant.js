// Client-side quantitative routines, unchanged from the original public/app.js.

import { clamp, mean } from './format.js';

export function sma(a, n, i) { i = i == null ? a.length - 1 : i; if (i - n + 1 < 0) return null; var s = 0; for (var j = i - n + 1; j <= i; j++) s += a[j]; return s / n; }
export function rsiSeries(c, n) { n = n || 14; var out = c.map(function () { return null; }), g = 0, l = 0, i; if (c.length <= n) return out; for (i = 1; i <= n; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l); for (i = n + 1; i < c.length; i++) { var dd = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(dd, 0)) / n; l = (l * (n - 1) + Math.max(-dd, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out; }

/* Black–Scholes (for the "today" curve only) */
export function ncdf(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2), p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x > 0 ? 1 - p : p; }
export const RATE = 0.065;
export function bs(type, S, K, T, v) { if (T <= 0 || !(v > 0)) return Math.max(0, type === 'C' ? S - K : K - S); var sq = v * Math.sqrt(T), d1 = (Math.log(S / K) + (RATE + v * v / 2) * T) / sq, d2 = d1 - sq; return type === 'C' ? S * ncdf(d1) - K * Math.exp(-RATE * T) * ncdf(d2) : K * Math.exp(-RATE * T) * ncdf(-d2) - S * ncdf(-d1); }

export function logRet(a) { var r = []; for (var i = 1; i < a.length; i++) r.push(Math.log(a[i] / a[i - 1])); return r; }
export function corrDist(R, end, win) {
  var n = R.length, i, j, k;
  var seg = R.map(function (r) { return r.slice(end - win + 1, end + 1); });
  var mu = seg.map(function (s) { return mean(s); });
  var sd = seg.map(function (s, a) { return Math.sqrt(mean(s.map(function (v) { return (v - mu[a]) * (v - mu[a]); }))); });
  var D = [], rhoSum = 0, cnt = 0;
  for (i = 0; i < n; i++) { D.push(new Array(n).fill(0)); }
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
    var c = 0;
    for (k = 0; k < win; k++) c += (seg[i][k] - mu[i]) * (seg[j][k] - mu[j]);
    c = c / win / ((sd[i] * sd[j]) || 1e-12);
    c = clamp(c, -1, 1);
    D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
    rhoSum += c; cnt++;
  }
  return { D: D, rho: rhoSum / cnt };
}
// classical MDS to 2-D
export function mds(D) {
  var n = D.length, B = [], i, j;
  var d2 = D.map(function (r) { return r.map(function (v) { return v * v; }); });
  var rowM = d2.map(mean), all = mean(rowM);
  for (i = 0; i < n; i++) { B.push([]); for (j = 0; j < n; j++) B[i].push(-0.5 * (d2[i][j] - rowM[i] - rowM[j] + all)); }
  function power(M, exclude) {
    var v = new Array(n).fill(0).map(function (_, i2) { return Math.sin(i2 * 2.399 + 1); }), it, k2, s;
    for (it = 0; it < 120; it++) {
      var w = new Array(n).fill(0);
      for (k2 = 0; k2 < n; k2++) for (var l = 0; l < n; l++) w[k2] += M[k2][l] * v[l];
      if (exclude) { var dot = 0; for (k2 = 0; k2 < n; k2++) dot += w[k2] * exclude.vec[k2]; for (k2 = 0; k2 < n; k2++) w[k2] -= dot * exclude.vec[k2]; }
      s = Math.sqrt(w.reduce(function (a, b) { return a + b * b; }, 0)) || 1;
      v = w.map(function (x) { return x / s; });
    }
    var lam = 0; for (k2 = 0; k2 < n; k2++) { var row = 0; for (var l2 = 0; l2 < n; l2++) row += M[k2][l2] * v[l2]; lam += row * v[k2]; }
    return { vec: v, lam: Math.max(0, lam) };
  }
  var e1 = power(B, null), e2 = power(B, e1);
  return e1.vec.map(function (v, i2) { return [v * Math.sqrt(e1.lam), e2.vec[i2] * Math.sqrt(e2.lam)]; });
}
export function symdiff(a, b) { var o = [], i = 0, j = 0; while (i < a.length && j < b.length) { if (a[i] < b[j]) o.push(a[i++]); else if (a[i] > b[j]) o.push(b[j++]); else { i++; j++; } } while (i < a.length) o.push(a[i++]); while (j < b.length) o.push(b[j++]); return o; }
export function persistence(D) {
  var n = D.length, E = [], i, j, k;
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) E.push({ i: i, j: j, d: D[i][j] });
  E.sort(function (a, b) { return a.d - b.d; });
  var eid = new Int32Array(n * n);
  E.forEach(function (e, x) { eid[e.i * n + e.j] = x; eid[e.j * n + e.i] = x; });
  var par = []; for (i = 0; i < n; i++) par.push(i);
  function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
  var h0 = [];
  for (k = 0; k < E.length; k++) { var a = find(E[k].i), b = find(E[k].j); if (a !== b) { par[a] = b; h0.push({ dim: 0, b: 0, d: E[k].d, edge: k }); } }
  h0.push({ dim: 0, b: 0, d: Infinity });
  var T = [];
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) {
    var col = [eid[i * n + j], eid[i * n + k], eid[j * n + k]].sort(function (x, y) { return x - y; });
    T.push({ col: col, v: [i, j, k] });
  }
  T.sort(function (a, b) { return a.col[2] - b.col[2] || a.col[1] - b.col[1] || a.col[0] - b.col[0]; });
  var pivot = new Int32Array(E.length).fill(-1), R = [], h1 = [];
  T.forEach(function (t) {
    var c = t.col, death = E[t.col[2]].d;
    while (c.length) { var p = pivot[c[c.length - 1]]; if (p < 0) break; c = symdiff(c, R[p]); }
    if (c.length) { var low = c[c.length - 1]; pivot[low] = R.length; R.push(c); var birth = E[low].d; if (death - birth > 1e-9) h1.push({ dim: 1, b: birth, d: death, cycle: c }); }
  });
  return { E: E, T: T, h0: h0, h1: h1 };
}
export function corrOf(a, b) {
  var n = Math.min(a.length, b.length), ma = mean(a), mb = mean(b), cov = 0, va = 0, vb = 0;
  for (var i = 0; i < n; i++) { var x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  var d = Math.sqrt(va * vb);
  return d ? clamp(cov / d, -1, 1) : 0;
}
