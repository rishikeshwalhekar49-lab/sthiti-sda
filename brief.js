#!/usr/bin/env node
'use strict';
// Prints the numbers worth quoting on stage. Run it just before presenting:
//     node brief.js
// The server must be running (node server.js, or the preview pane).

const http = require('http');
const an = require('./lib/analytics');
const pat = require('./lib/patents');

const get = (p) => new Promise((resolve, reject) => {
  http.get('http://localhost:3000' + p, (res) => {
    let b = '';
    res.on('data', (c) => { b += c; });
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

const inr = (v) => (v < 0 ? '−' : '+') + '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN') + ' cr';

(async () => {
  let live, eod;
  try { [live, eod] = await Promise.all([get('/api/live'), get('/api/eod')]); }
  catch (e) { console.error('Server not reachable on localhost:3000 — start it first.'); process.exit(1); }

  const ix = live.indices || {};
  const n50 = ix['NIFTY 50'] || {}, vix = ix['INDIA VIX'] || {}, n500 = ix['NIFTY 500'] || {};
  const ad = n500.declines ? n500.advances / n500.declines : null;

  const R = eod.sectors.map((s) => an.logRets(s.c));
  const win = pat.corrMatrix(R, R[0].length - 1, 60);
  const reg = an.regimeSeries(eod.sectors, eod.dates);
  const label = { calm: 'Calm', trans: 'Transitional', stress: 'Stress' }[reg.label(win.rho)];

  const bt = eod.backtests.golden.trades;
  const split = ['calm', 'trans', 'stress'].map((k) => {
    const t = bt.filter((x) => x.regime === k);
    if (!t.length) return `${k}: no trades`;
    const win = t.filter((x) => x.ret > 0).length / t.length * 100;
    const avg = t.reduce((a, x) => a + x.ret, 0) / t.length;
    return `${k} ${win.toFixed(0)}% win / ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}% (n=${t.length})`;
  });

  const say = (k, v) => console.log('  ' + k.padEnd(24) + v);
  console.log('\n── Numbers to quote ─────────────────────────────────────────');
  say('Market', `${live.market.status}, ${live.market.tradeDate}`);
  say('NIFTY 50', `${n50.last?.toLocaleString('en-IN')} (${n50.pct > 0 ? '+' : ''}${n50.pct}%)`);
  say('India VIX', vix.last);
  say('Breadth (NIFTY 500)', ad ? `${n500.advances} up / ${n500.declines} down = ${ad.toFixed(2)}` : '—');
  if (live.flows?.fii) say('FII / DII', `${inr(live.flows.fii.net)} / ${inr(live.flows.dii.net)} (${live.flows.fii.date})`);
  console.log('');
  say('Regime', `${label} — mean sector ρ ${win.rho.toFixed(2)}`);
  say('Bands', `calm < ${reg.p33.toFixed(2)} · stress ≥ ${reg.p67.toFixed(2)}`);
  say('History', `${eod.dates.length} sessions to ${eod.asOf}, ${eod.sectors.length} sector indices`);
  say('Calibrated window', `${eod.calibration.chosen} sessions`);
  console.log('');
  say('Scanner', `${eod.scan.length} hits from the NIFTY 500`);
  if (eod.scan[0]) say('  top hit', `${eod.scan[0].sym} — ${eod.scan[0].sig} (${eod.scan[0].volRatio?.toFixed(1)}× volume)`);
  say('Topo-Screen', `${eod.topo.length} stocks; most isolated ${eod.topo[0].sym} at ${eod.topo[0].dist.toFixed(2)}`);
  say('Cross-asset layers', `${eod.layers.length} indices`);
  if (eod.ivSurface) say('IV surface', `${eod.ivSurface.expiries.length} expiries, ${eod.ivSurface.basins} basins`);
  console.log('');
  say('Golden cross by regime', split[0]);
  say('', split[1]);
  say('', split[2]);
  console.log('─────────────────────────────────────────────────────────────\n');
})();
