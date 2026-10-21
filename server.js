'use strict';
// Sthiti — local data server. Serves the site and proxies NSE/BSE public data.
// Run: node server.js   →   http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const live = require('./lib/live');
const eod = require('./lib/eod');
const an = require('./lib/analytics');
const explain = require('./lib/explain');
const pat = require('./lib/patents');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function readBody(req, limit = 200000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('invalid JSON body')); } });
    req.on('error', reject);
  });
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};

function serveStatic(req, res) {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(PUBLIC, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function eodOptions(data) {
  const fo = data && data.fo;
  if (!fo) return null;
  const today = fo.tradeDate;
  const expiries = Object.keys(fo.expiries).sort();
  const expiry = expiries.find((e) => e > today) || expiries[0];
  if (!expiry) return null;
  const byStrike = new Map();
  for (const r of fo.expiries[expiry]) {
    const row = byStrike.get(r.K) || { K: r.K, ce: null, pe: null };
    const leg = { ltp: r.ltp, iv: null, oi: r.oi, chgOi: r.chgOi, vol: r.vol };
    if (r.t === 'CE') row.ce = leg; else if (r.t === 'PE') row.pe = leg;
    byStrike.set(r.K, row);
  }
  return {
    source: 'eod', expiry, timestamp: `NSE F&O close, ${fo.tradeDate}`, und: fo.und, lot: fo.lot,
    strikes: [...byStrike.values()].sort((a, b) => a.K - b.K),
  };
}

const surrogateCache = new Map();

const routes = {
  '/api/live': async () => {
    const [m, ix, fl] = await Promise.all([live.market(), live.indices(), live.flows()]);
    const errors = [m, ix, fl].map((e) => e.error).filter(Boolean);
    return {
      fetchedAt: new Date().toISOString(),
      market: m.value, marketAt: m.at,
      indices: ix.value, indicesAt: ix.at, indicesStale: ix.stale,
      flows: fl.value, flowsAt: fl.at,
      errors,
    };
  },
  '/api/quotes': async () => {
    const q = await live.quotes();
    return { fetchedAt: new Date().toISOString(), ...q };
  },
  '/api/options': async () => {
    const data = eod.state.data;
    const lot = data && data.fo ? data.fo.lot : null;
    const chain = await live.optionChain();
    if (chain.value && chain.value.strikes && chain.value.strikes.length) {
      return { ...chain.value, lot, at: chain.at, stale: chain.stale, error: chain.error };
    }
    const fallback = eodOptions(data);
    if (fallback) return { ...fallback, error: chain.error || 'live chain unavailable' };
    return { error: chain.error || 'no option data', strikes: [] };
  },
  '/api/eod': async () => {
    const data = await eod.ensureData(console.log).catch(() => null);
    if (!data) {
      return { building: true, done: eod.state.done, total: eod.state.total, error: eod.state.error };
    }
    return data;
  },
  '/api/portfolio': async (req) => {
    const body = await readBody(req);
    const data = eod.state.data;
    if (!data) return { error: 'End-of-day data is still loading.' };
    const holdings = (body.holdings || [])
      .map((h) => ({ sym: String(h.sym || '').trim().toUpperCase(), weight: Number(h.weight) > 0 ? Number(h.weight) : 1 }))
      .filter((h) => h.sym);
    if (holdings.length < 2) return { error: 'Give at least two holdings.' };
    if (holdings.length > 60) return { error: 'Up to 60 holdings at a time.' };
    return an.portfolioReport(holdings, eod.state.rets, eod.state.meta);
  },
  '/api/episode': async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return { error: 'from and to must be YYYY-MM-DD' };
    return eod.indexRange(from, to, console.log);
  },
  '/api/explain': async (req) => {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const data = eod.state.data;
    if (!data) return { error: 'End-of-day data is still loading.' };
    const [m, ix, fl] = await Promise.all([live.market(), live.indices(), live.flows()]);
    const x = explain.facts(data, { market: m.value, indices: ix.value, flows: fl.value });
    const question = String(body.question || 'What is the market regime right now, and what changed?').slice(0, 400);
    const out = { question, facts: x, plain: explain.plainAnswer(x), llmAvailable: explain.llmAvailable(), llm: null, llmError: null };
    if (out.llmAvailable) {
      try { out.llm = await explain.llmAnswer(question, x); }
      catch (err) { out.llmError = err.message; }
    }
    return out;
  },
  '/api/surrogate': async (req) => {
    const data = eod.state.data;
    if (!data) return { error: 'End-of-day data is still loading.' };
    const url = new URL(req.url, 'http://localhost');
    const win = Math.max(20, Math.min(180, parseInt(url.searchParams.get('win'), 10) || (data.calibration ? data.calibration.chosen : 60)));
    const n = Math.max(50, Math.min(500, parseInt(url.searchParams.get('n'), 10) || 200));
    const endParam = parseInt(url.searchParams.get('end'), 10);
    const key = `sur:${win}:${n}:${Number.isFinite(endParam) ? endParam : 'last'}:${data.asOf}`;
    if (surrogateCache.has(key)) return surrogateCache.get(key);
    const t0 = Date.now();
    const out = pat.surrogateTest(data.sectors, data.dates, { win, n, end: Number.isFinite(endParam) ? endParam : null });
    out.shift = pat.shiftTest(data.sectors, data.dates, { win, n: Math.min(400, n * 2), end: Number.isFinite(endParam) ? endParam : null });
    out.ms = Date.now() - t0;
    surrogateCache.set(key, out);
    if (surrogateCache.size > 20) surrogateCache.delete(surrogateCache.keys().next().value);
    return out;
  },
  '/api/status': async () => ({
    building: eod.state.building, done: eod.state.done, total: eod.state.total,
    asOf: eod.state.data ? eod.state.data.asOf : null, error: eod.state.error,
  }),
};

const server = http.createServer(async (req, res) => {
  const p = req.url.split('?')[0];
  if (routes[p]) {
    const t0 = Date.now();
    try {
      const out = await routes[p](req);
      const ms = Date.now() - t0;
      if (ms > 2000) console.log(`  slow: ${p} took ${(ms / 1000).toFixed(1)}s`);
      return json(res, out && out.building ? 202 : 200, out);
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }
  serveStatic(req, res);
});

server.keepAliveTimeout = 65000;   // outlast the browser's idle keep-alive
server.headersTimeout = 70000;

server.listen(PORT, () => {
  console.log(`\nSthiti running at http://localhost:${PORT}`);
  console.log('Downloading NSE end-of-day files (first run takes a minute or two)…');
  // warm the live caches so the first page load is clean
  live.market().then(() => Promise.all([live.indices(), live.flows(), live.quotes(), live.optionChain()]))
    .then(() => console.log('Live feeds connected (NSE indices, flows, option chain; BSE quotes).'))
    .catch(() => {});
  eod.ensureData(console.log)
    .then((d) => console.log(`Ready. History to ${d.asOf}: ${d.dates.length} trading days, ${Object.keys(d.stocks).length} stocks, ${d.scan.length} scanner hits.`))
    .catch((e) => console.error('End-of-day build failed:', e.message));
  setInterval(() => { eod.ensureData(() => {}).catch(() => {}); }, 2 * 3600 * 1000);
});
