'use strict';
// Runs the ORIGINAL Node implementation (../../../../lib) on real cached NSE data and writes
// its inputs and outputs to fixtures.json, so the Python port can be checked number by number.
// Read-only with respect to the original project. Usage: node tests/parity/dump.js
const fs = require('fs');
const path = require('path');
const ORIG = path.join(__dirname, '..', '..', '..', '..', 'lib');
const ind = require(path.join(ORIG, 'ind'));
const an = require(path.join(ORIG, 'analytics'));
const pat = require(path.join(ORIG, 'patents'));
const { SECTORS, SCREENER } = require(path.join(ORIG, 'config'));

const CACHE = path.join(__dirname, '..', '..', 'cache');
const read = (d, k) => JSON.parse(fs.readFileSync(path.join(CACHE, d, k + '.json'), 'utf8'));
const keys = fs.readdirSync(path.join(CACHE, 'idx')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 8))
  .filter((k) => fs.existsSync(path.join(CACHE, 'cm', k + '.json'))).sort().slice(-500);
const iso = (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const ix = new Map(keys.map((k) => [k, read('idx', k)]));
const eq = new Map(keys.map((k) => [k, read('cm', k)]));
const dates = keys.map(iso);
const sectors = SECTORS.map(([name, code]) => ({ name, code, c: keys.map((k) => (ix.get(k)[name] ? ix.get(k)[name][0] : null)) }))
  .filter((s) => s.c.every((v) => v != null));
const nifty = keys.map((k) => (ix.get(k)['Nifty 50'] ? ix.get(k)['Nifty 50'][0] : null));

// a few screener stocks, full OHLC
const stocks = {};
for (const s of SCREENER.slice(0, 4)) {
  const row = (f) => keys.map((k) => (eq.get(k)[s.sym] ? eq.get(k)[s.sym][f] : null));
  stocks[s.sym] = { h: row(1), l: row(2), c: row(3) };
}
const clean = (a) => a.filter((v) => v != null);

// a universe of 60 liquid symbols for the cross-sectional parts
const last = eq.get(keys[keys.length - 1]);
const universeSyms = Object.keys(last).filter((sym) => keys.every((k) => eq.get(k)[sym])).slice(0, 60);
const universe = universeSyms.map((sym) => ({
  sym, dates, closes: keys.map((k) => eq.get(k)[sym][3]), highs: keys.map((k) => eq.get(k)[sym][1]),
}));
const retsBySym = {};
universe.forEach((u) => { retsBySym[u.sym] = an.logRets(u.closes).slice(-90); });
const niftyRets = an.logRets(clean(nifty));

const regime = an.regimeSeries(sectors, dates);
const R = sectors.map((s) => an.logRets(s.c));
const cm = pat.corrMatrix(R, R[0].length - 1, 60);
const foKey = fs.readdirSync(path.join(CACHE, 'fo')).filter((f) => f.endsWith('.json')).sort().pop();
const fo = foKey ? JSON.parse(fs.readFileSync(path.join(CACHE, 'fo', foKey), 'utf8')) : null;
const holdings = universeSyms.slice(0, 9).map((sym, i) => ({ sym, weight: 9 - i }));

const out = {
  inputs: { dates, sectors, nifty, stocks, universe, holdings, fo },
  outputs: {
    ind: Object.fromEntries(Object.entries(stocks).map(([k, s]) => {
      const c = clean(s.c), h = clean(s.h), l = clean(s.l);
      return [k, { rsi: ind.rsi(c), atr: ind.atr(h, l, c), sma50: ind.sma(c, 50), sma200: ind.sma(c, 200),
        beta: ind.beta(s.c, nifty), doubleBottom: ind.doubleBottom(c) }];
    })),
    regime: { series: regime.series, p33: regime.p33, p67: regime.p67, byDate: regime.byDate },
    universeMetrics: an.universeMetrics(universeSyms, retsBySym, niftyRets),
    backtests: an.runBacktests(universe, regime.byDate),
    portfolio: an.portfolioReport(holdings.map((h) => ({ ...h })), retsBySym, {}),
    corrMatrix: cm,
    persistence: pat.persistence(cm.D),
    calibrate: pat.calibrate(sectors, dates),
    surrogate: pat.surrogateTest(sectors, dates, { win: 60, n: 60 }),
    shift: pat.shiftTest(sectors, dates, { win: 60, n: 120 }),
    ivSurface: fo ? pat.ivSurface(fo) : null,
  },
};
fs.writeFileSync(path.join(__dirname, 'fixtures.json'), JSON.stringify(out));
console.log(`fixtures: ${dates.length} sessions, ${sectors.length} sectors, ${universe.length}-stock universe, IV surface ${fo ? 'yes' : 'no'}`);
