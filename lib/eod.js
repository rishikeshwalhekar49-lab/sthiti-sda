'use strict';
// End-of-day data from NSE's official daily files (bhavcopies and index closes),
// plus everything computed from them: indicators, scanner hits, regime series.

const fs = require('fs');
const path = require('path');
const { archive } = require('./net');
const { unzipFirst } = require('./zip');
const ind = require('./ind');
const an = require('./analytics');
const pat = require('./patents');
const { SCREENER, SECTORS, LAYERS, HISTORY_DAYS } = require('./config');

const CACHE = path.join(__dirname, '..', 'cache');
const dirs = { cm: path.join(CACHE, 'cm'), idx: path.join(CACHE, 'idx'), fo: path.join(CACHE, 'fo'), meta: path.join(CACHE, 'meta') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

/* ---------- dates (IST) ---------- */
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const keyOf = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const isoOf = (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const dmyOf = (k) => `${k.slice(6, 8)}${k.slice(4, 6)}${k.slice(0, 4)}`;

/* ---------- csv ---------- */
function splitLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const head = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/* ---------- cached daily files ---------- */
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }

async function dayEquities(k, todayKey) {
  const file = path.join(dirs.cm, k + '.json');
  const miss = path.join(dirs.cm, k + '.none');
  const hit = readJson(file);
  if (hit) return hit;
  if (fs.existsSync(miss)) return null;
  const buf = await archive(`cm/BhavCopy_NSE_CM_0_0_0_${k}_F_0000.csv.zip`);
  if (!buf) { if (k !== todayKey) fs.writeFileSync(miss, ''); return null; }
  let rows;
  try { rows = parseCsv(unzipFirst(buf).toString('utf8')); }
  catch (_) { if (k !== todayKey) fs.writeFileSync(miss, ''); return null; }
  const out = {};
  for (const r of rows) {
    if (r.SctySrs !== 'EQ') continue;
    out[r.TckrSymb] = [num(r.OpnPric), num(r.HghPric), num(r.LwPric), num(r.ClsPric), num(r.TtlTradgVol)];
  }
  if (!Object.keys(out).length) return null;
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

async function dayIndices(k, todayKey) {
  const file = path.join(dirs.idx, k + '.json');
  const miss = path.join(dirs.idx, k + '.none');
  const hit = readJson(file);
  if (hit) return hit;
  if (fs.existsSync(miss)) return null;
  const buf = await archive(`indices/ind_close_all_${dmyOf(k)}.csv`);
  if (!buf) { if (k !== todayKey) fs.writeFileSync(miss, ''); return null; }
  const rows = parseCsv(buf.toString('utf8'));
  const out = {};
  for (const r of rows) {
    const name = r['Index Name'];
    if (!name) continue;
    out[name] = [num(r['Closing Index Value']), num(r['P/E']), num(r['Change(%)'])];
  }
  if (!Object.keys(out).length) return null;
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// NIFTY options from the F&O bhavcopy (fallback when the live chain is unavailable,
// and the source for the contract lot size).
async function dayOptions(k) {
  const file = path.join(dirs.fo, k + '.json');
  const hit = readJson(file);
  if (hit) return hit;
  const buf = await archive(`fo/BhavCopy_NSE_FO_0_0_0_${k}_F_0000.csv.zip`);
  if (!buf) return null;
  let rows;
  try { rows = parseCsv(unzipFirst(buf).toString('utf8')); } catch (_) { return null; }
  const byExpiry = {};
  let lot = null, und = null;
  for (const r of rows) {
    if (r.FinInstrmTp !== 'IDO' || r.TckrSymb !== 'NIFTY') continue;
    const exp = r.XpryDt;
    lot = num(r.NewBrdLotQty) || lot;
    und = num(r.UndrlygPric) || und;
    (byExpiry[exp] = byExpiry[exp] || []).push({
      K: num(r.StrkPric), t: r.OptnTp,
      ltp: num(r.ClsPric) ?? num(r.SttlmPric), oi: num(r.OpnIntrst), chgOi: num(r.ChngInOpnIntrst), vol: num(r.TtlTradgVol),
    });
  }
  if (!lot) return null;
  const out = { tradeDate: isoOf(k), lot, und, expiries: byExpiry };
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

async function nifty500List() {
  const file = path.join(dirs.meta, 'nifty500.json');
  const hit = readJson(file);
  if (hit && Date.now() - hit.at < 7 * 864e5) return hit.rows;
  const buf = await archive('indices/ind_nifty500list.csv');
  if (!buf) return hit ? hit.rows : [];
  const rows = parseCsv(buf.toString('utf8'))
    .filter((r) => r.Symbol)
    .map((r) => ({ sym: r.Symbol.trim(), name: (r['Company Name'] || '').trim(), industry: (r.Industry || '').trim() }));
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), rows }));
  return rows;
}

/* ---------- concurrency ---------- */
async function pool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (i < items.length) { const k = items[i++]; await worker(k); }
  });
  await Promise.all(runners);
}

/* ---------- build ---------- */
let state = { building: false, done: 0, total: 0, data: null, error: null, builtAt: 0, rets: {}, meta: {} };

function seriesOf(dates, dayMaps, sym, field) {
  return dates.map((k) => { const row = dayMaps.get(k)[sym]; return row ? row[field] : null; });
}

async function build(log = () => {}) {
  const today = istNow(), todayKey = keyOf(today);
  const candidates = [];
  for (let i = 0; i < 780 && candidates.length < 560; i++) {
    const d = new Date(today.getTime() - i * 864e5);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    candidates.push(keyOf(d));
  }
  const eq = new Map(), ix = new Map();
  state.total = candidates.length; state.done = 0;
  await pool(candidates, 4, async (k) => {
    try {
      const e = await dayEquities(k, todayKey);
      if (e) { eq.set(k, e); const i2 = await dayIndices(k, todayKey); if (i2) ix.set(k, i2); }
    } catch (err) { log(`  ${k}: ${err.message}`); }
    state.done++;
  });

  const dates = [...eq.keys()].filter((k) => ix.has(k)).sort().slice(-HISTORY_DAYS);
  if (dates.length < 60) throw new Error(`only ${dates.length} trading days downloaded; NSE archive may be blocking this machine`);
  const last = dates[dates.length - 1];
  log(`  ${dates.length} trading days, latest ${isoOf(last)}`);

  const list = await nifty500List();
  const meta = new Map(list.map((r) => [r.sym, r]));

  // index closes
  const idxSeries = (name) => dates.map((k) => (ix.get(k)[name] ? ix.get(k)[name][0] : null));
  const nifty = idxSeries('Nifty 50');
  const vix = idxSeries('India VIX');
  const sectors = SECTORS
    .map(([name, code]) => ({ name, code, c: idxSeries(name) }))
    .filter((s) => s.c.every((v) => v != null));
  const layers = LAYERS
    .map(([name, code, group]) => ({ name, code, group, c: idxSeries(name) }))
    .filter((s) => s.c.every((v) => v != null));

  // screener stocks
  const stocks = {};
  for (const s of SCREENER) {
    const o = seriesOf(dates, eq, s.sym, 0), h = seriesOf(dates, eq, s.sym, 1);
    const l = seriesOf(dates, eq, s.sym, 2), c = seriesOf(dates, eq, s.sym, 3), v = seriesOf(dates, eq, s.sym, 4);
    const valid = c.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
    if (valid.length < 210) { log(`  ${s.sym}: only ${valid.length} days, skipped`); continue; }
    const cc = valid.map((i) => c[i]), hh = valid.map((i) => h[i]), ll = valid.map((i) => l[i]);
    const r = ind.rsi(cc);
    stocks[s.sym] = {
      sym: s.sym, name: (meta.get(s.sym) || {}).name || s.sym, sector: s.sector, sectorIndex: s.sectorIndex, bse: s.bse,
      dates: valid.map((i) => isoOf(dates[i])), o: valid.map((i) => o[i]), h: hh, l: ll, c: cc, v: valid.map((i) => v[i]),
      rsi: r[r.length - 1], atr: ind.atr(hh, ll, cc), beta: ind.beta(c, nifty),
      sma50: ind.sma(cc, 50), sma200: ind.sma(cc, 200),
      hi52: Math.max(...hh.slice(-250)), lo52: Math.min(...ll.slice(-250)),
    };
  }

  // scanner across the NIFTY 500
  const scan = [], universe = [];
  for (const row of list) {
    const c = seriesOf(dates, eq, row.sym, 3);
    if (c[c.length - 1] == null) continue;
    const valid = c.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
    if (valid.length < 215) continue;
    const hAll = seriesOf(dates, eq, row.sym, 1), lAll = seriesOf(dates, eq, row.sym, 2), vAll = seriesOf(dates, eq, row.sym, 4);
    const cc = valid.map((i) => c[i]);
    const hh = valid.map((i) => hAll[i]);
    const ll = valid.map((i) => lAll[i]);
    const vv = valid.map((i) => vAll[i]);
    const n = cc.length;
    const r = ind.rsi(cc);
    const s50 = ind.sma(cc, 50), s50p = ind.sma(cc, 50, n - 2);
    const s200 = ind.sma(cc, 200), s200p = ind.sma(cc, 200, n - 2);
    const close = cc[n - 1], prev = cc[n - 2];
    const chg = (close / prev - 1) * 100;
    const avgVol = vv.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const volRatio = avgVol ? vv[n - 1] / avgVol : null;
    const hi250 = Math.max(...hh.slice(-251, -1)), lo250 = Math.min(...ll.slice(-251, -1));
    universe.push({ sym: row.sym, name: row.name, industry: row.industry, dates: valid.map((i) => isoOf(dates[i])), closes: cc, highs: hh, close, chg, rsi: r[n - 1], volRatio });
    const hits = [];
    if (s200 && s200p && close > s200 && prev <= s200p) hits.push(['ma', 'Crossed above the 200-day MA']);
    if (s200 && s200p && close < s200 && prev >= s200p) hits.push(['ma', 'Crossed below the 200-day MA']);
    if (s50 && s200 && s50p && s200p && s50 > s200 && s50p <= s200p) hits.push(['ma', 'Golden cross: 50-day above 200-day']);
    if (s50 && s200 && s50p && s200p && s50 < s200 && s50p >= s200p) hits.push(['ma', 'Death cross: 50-day below 200-day']);
    if (close > hi250) hits.push(['pattern', 'New 52-week high']);
    if (close < lo250) hits.push(['pattern', 'New 52-week low']);
    if (ind.doubleBottom(cc)) hits.push(['pattern', 'Double bottom: neckline broken']);
    if (r[n - 1] > 70 && r[n - 2] <= 70) hits.push(['rsi', `RSI crossed above 70 (${Math.round(r[n - 1])})`]);
    if (r[n - 1] < 30 && r[n - 2] >= 30) hits.push(['rsi', `RSI crossed below 30 (${Math.round(r[n - 1])})`]);
    for (const [group, sig] of hits) {
      scan.push({
        sym: row.sym, name: row.name, industry: row.industry, group, sig, close, chg, volRatio,
        rsi: r[n - 1], spark: cc.slice(-60).map((x) => Math.round(x * 100) / 100),
      });
    }
  }
  scan.sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));

  const indexPE = {};
  for (const [name, row] of Object.entries(ix.get(last))) if (row[1] != null) indexPE[name] = row[1];

  // options: latest F&O bhavcopy (live chain is layered on top by the server)
  let fo = null;
  for (let i = dates.length - 1; i >= dates.length - 4 && i >= 0; i--) {
    try { fo = await dayOptions(dates[i]); } catch (_) { fo = null; }
    if (fo) break;
  }

  // correlation topology across the universe, regime labels, and backtests
  const retsBySym = {};
  universe.forEach((u) => { retsBySym[u.sym] = an.logRets(u.closes).slice(-90); });
  const niftyRets = an.logRets(nifty.filter((v) => v != null));
  const metrics = an.universeMetrics(universe.map((u) => u.sym), retsBySym, niftyRets);
  const topo = universe.filter((u) => metrics[u.sym]).map((u) => ({
    sym: u.sym, name: u.name, industry: u.industry, close: u.close, chg: u.chg, rsi: u.rsi, volRatio: u.volRatio,
    dist: metrics[u.sym].dist, avgCorr: metrics[u.sym].avgCorr, corrChg: metrics[u.sym].corrChg, corrMkt: metrics[u.sym].corrMkt,
  })).sort((a, b) => b.dist - a.dist);
  const regime = an.regimeSeries(sectors, dates.map(isoOf));
  const t0 = Date.now();
  const calibration = pat.calibrate(sectors, dates.map(isoOf));
  const ivSurface = fo ? pat.ivSurface(fo) : null;
  log(`  calibration sweep: window ${calibration.chosen} sessions (${((Date.now() - t0) / 1000).toFixed(1)}s)` + (ivSurface ? ` · IV surface ${ivSurface.expiries.length} expiries × ${ivSurface.strikes.length} strikes, ${ivSurface.basins} basins` : ' · no IV surface'));
  const backtests = an.runBacktests(universe, regime.byDate);
  state.rets = retsBySym;
  state.meta = Object.fromEntries(universe.map((u) => [u.sym, { name: u.name, industry: u.industry }]));
  log(`  topology on ${topo.length} stocks · backtest trades: ` + Object.keys(backtests).map((k) => `${k} ${backtests[k].trades.length}`).join(', '));

  return {
    asOf: isoOf(last),
    dates: dates.map(isoOf),
    nifty, vix, sectors, stocks, indexPE,
    scan: scan.slice(0, 60),
    scanUniverse: list.length,
    topo,
    layers,
    backtests,
    calibration,
    ivSurface,
    regimeThresholds: { p33: regime.p33, p67: regime.p67 },
    fo,
    builtAt: new Date().toISOString(),
  };
}

async function ensureData(log) {
  if (state.data && Date.now() - state.builtAt < 2 * 3600 * 1000) return state.data;
  if (state.building) return state.data;
  state.building = true; state.error = null;
  try {
    const data = await build(log);
    state.data = data; state.builtAt = Date.now();
    return data;
  } catch (err) {
    state.error = err.message;
    throw err;
  } finally {
    state.building = false;
  }
}

// Sector index closes for an arbitrary date range (used by the crash simulator).
async function indexRange(fromIso, toIso, log = () => {}) {
  const todayKey = keyOf(istNow());
  const start = new Date(fromIso + 'T00:00:00Z'), end = new Date(toIso + 'T00:00:00Z');
  const keys = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) keys.push(keyOf(d));
  }
  if (keys.length > 500) throw new Error('range too long');
  const got = new Map();
  await pool(keys, 4, async (k) => {
    try { const r = await dayIndices(k, todayKey); if (r) got.set(k, r); } catch (err) { log(`  ${k}: ${err.message}`); }
  });
  const dates = [...got.keys()].sort();
  if (dates.length < 70) throw new Error(`only ${dates.length} sessions available for that range`);
  const sectors = SECTORS
    .map(([name, code]) => ({ name, code, c: dates.map((k) => (got.get(k)[name] ? got.get(k)[name][0] : null)) }))
    .filter((s) => s.c.every((v) => v != null));
  const nifty = dates.map((k) => (got.get(k)['Nifty 50'] ? got.get(k)['Nifty 50'][0] : null));
  return { from: isoOf(dates[0]), to: isoOf(dates[dates.length - 1]), dates: dates.map(isoOf), sectors, nifty };
}

module.exports = { ensureData, state, dayOptions, indexRange, istNow, keyOf, isoOf };
