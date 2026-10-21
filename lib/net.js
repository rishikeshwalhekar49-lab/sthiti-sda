'use strict';
// HTTP helpers for NSE and BSE public endpoints. No dependencies: Node 18+ fetch.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const https = require('https');
const { URL } = require('url');

// NSE and BSE drop idle keep-alive connections without telling the client, and a reused dead
// socket stalls until the request timeout. A fresh connection per request costs one handshake
// and is reliable; the archive host is fine with keep-alive because those bursts are back to back.
const agent = new https.Agent({ keepAlive: false, maxSockets: 6 });
const archiveAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 2000, maxSockets: 6, maxFreeSockets: 2, timeout: 20000 });

function get(url, { headers = {}, timeout = 8000, redirects = 3, pool = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method: 'GET', agent: pool ? archiveAgent : agent,
      insecureHTTPParser: true,   // BSE sends a header with trailing whitespace that the strict parser rejects
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'identity', Connection: 'keep-alive', ...headers },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), { headers, timeout, redirects: redirects - 1, pool }));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: { getSetCookie: () => res.headers['set-cookie'] || [] },
        buf: Buffer.concat(chunks),
      }));
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => { req.destroy(new Error(`timed out after ${timeout / 1000}s`)); });
    req.on('error', reject);
    req.end();
  });
}

function parseJson(buf, label) {
  const first = buf.toString('utf8', 0, 1);
  if (first !== '{' && first !== '[') throw new Error(`${label}: not JSON (blocked or unavailable)`);
  return JSON.parse(buf.toString('utf8'));
}

/* ---------- NSE session (cookies from a page visit) ---------- */
const jar = new Map();
let warmedAt = 0;

function keepCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
// NSE's edge starts holding requests when the session tokens it gave us go stale: the
// request doesn't fail, it just never answers. Dropping the jar and starting a new session fixes it.
function resetSession() { jar.clear(); warmedAt = 0; }

let warming = null;
async function warmNse(force) {
  if (!force && Date.now() - warmedAt < 4 * 60 * 1000) return;
  if (Date.now() - warmedAt > 10 * 60 * 1000) jar.clear();   // never reuse a session for long
  if (warming) return warming;            // one warm-up at a time
  if (force && Date.now() - warmedAt < 20 * 1000) return;   // don't hammer on repeated failures
  warming = (async () => {
    try {
      const r = await get('https://www.nseindia.com/market-data/live-equity-market', { headers: { Accept: 'text/html,application/xhtml+xml', Cookie: cookieHeader() }, timeout: 6000 });
      keepCookies(r);
    } catch (_) { /* keep whatever cookies we have */ }
    warmedAt = Date.now();
    warming = null;
  })();
  return warming;
}

async function nseApi(pathAndQuery, referer = 'https://www.nseindia.com/market-data/live-equity-market') {
  await warmNse(false);
  const url = 'https://www.nseindia.com/api/' + pathAndQuery;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await get(url, { headers: { Accept: 'application/json, text/plain, */*', Referer: referer, Cookie: cookieHeader() }, timeout: attempt ? 9000 : 6000 });
      keepCookies(r);
      if (r.status === 200) {
        try { return parseJson(r.buf, 'NSE ' + pathAndQuery.split('?')[0]); } catch (e) { lastErr = e; }
      } else {
        lastErr = new Error(`NSE ${pathAndQuery.split('?')[0]}: HTTP ${r.status}`);
      }
    } catch (err) {
      lastErr = err;            // usually a timeout: the session has gone stale
    }
    resetSession();
    await warmNse(true);
  }
  throw lastErr || new Error('NSE request failed');
}

/* ---------- BSE ---------- */
// BSE drops connections when a burst arrives, so cap concurrency and retry once.
function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const job = queue.shift();
    job.fn().then(job.res, job.rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
}
const bseLimit = limiter(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bseApi(pathAndQuery) {
  const label = 'BSE ' + pathAndQuery.split('/')[0];
  return bseLimit(async () => {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await get('https://api.bseindia.com/BseIndiaAPI/api/' + pathAndQuery, {
          headers: { Accept: 'application/json, text/plain, */*', Origin: 'https://www.bseindia.com', Referer: 'https://www.bseindia.com/' },
        });
        if (r.status !== 200) throw new Error(`${label}: HTTP ${r.status}`);
        return parseJson(r.buf, label);
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await sleep(400);
      }
    }
    throw lastErr;
  });
}

/* ---------- NSE archives (official daily files) ---------- */
async function archive(pathRel) {
  const r = await get('https://nsearchives.nseindia.com/content/' + pathRel, { timeout: 30000, pool: true });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`NSE archive ${pathRel}: HTTP ${r.status}`);
  return r.buf;
}

module.exports = { get, nseApi, bseApi, archive, resetSession };
