'use strict';
// Live reads: NSE indices, breadth, FII/DII flows, option chain; BSE quotes and fundamentals.

const { nseApi, bseApi } = require('./net');
const { SCREENER } = require('./config');

const store = new Map();
const inflight = new Map();

async function cached(key, ttl, fn) {
  const old = store.get(key);
  if (old && Date.now() - old.at < ttl) return old;
  if (inflight.has(key)) return inflight.get(key);
  const deadline = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + (ms / 1000) + 's')), ms));
  const p = (async () => {
    try {
      const value = await Promise.race([fn(), deadline(9000)]);
      const entry = { value, at: Date.now(), error: null, stale: false };
      store.set(key, entry);
      return entry;
    } catch (err) {
      const entry = old
        ? { value: old.value, at: old.at, error: err.message, stale: true }
        : { value: null, at: Date.now(), error: err.message, stale: true };
      store.set(key, entry);
      return entry;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseNseDate(s) { // "29-Sep-2026"
  const [d, m, y] = String(s).split('-');
  return Date.UTC(+y, MONTHS[m], +d);
}
const istMidnight = () => {
  const n = new Date(Date.now() + 5.5 * 3600e3);
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

function clockOpen() {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes(), wd = ist.getUTCDay();
  return wd >= 1 && wd <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 40;
}

async function market() {
  const e = await cached('market', 60e3, async () => {
    const d = await nseApi('marketStatus');
    const cm = (d.marketState || []).find((m) => /capital market/i.test(m.market)) || {};
    // NSE's own flag reads "Open" outside trading hours, so check the IST clock too.
    const inHours = clockOpen();
    return {
      open: /open/i.test(cm.marketStatus || '') && inHours,
      status: cm.marketStatus || 'Unknown',
      tradeDate: cm.tradeDate || '',
      message: cm.marketStatusMessage || '',
      sourceSaysOpen: /open/i.test(cm.marketStatus || ''),
      nifty: cm.last ?? null,
    };
  });
  // never hand back a null market: fall back to the IST trading clock
  if (!e.value) return { ...e, value: { open: clockOpen(), status: 'Unknown', tradeDate: '', message: 'NSE status unavailable', sourceSaysOpen: false, nifty: null } };
  return e;
}
const isOpen = async () => (await market()).value?.open === true;
const ttl = (open, openMs, closedMs) => (open ? openMs : closedMs);

async function indices() {
  const open = await isOpen();
  return cached('indices', ttl(open, 30e3, 5 * 60e3), async () => {
    const d = await nseApi('allIndices');
    const out = {};
    for (const r of d.data || []) {
      out[(r.index || '').toUpperCase()] = {
        last: r.last, change: r.variation, pct: r.percentChange, open: r.open, high: r.high, low: r.low,
        prevClose: r.previousClose, pe: parseFloat(r.pe) || null, pb: parseFloat(r.pb) || null,
        advances: parseInt(r.advances, 10) || null, declines: parseInt(r.declines, 10) || null,
        unchanged: parseInt(r.unchanged, 10) || null, yearHigh: r.yearHigh, yearLow: r.yearLow,
      };
    }
    return out;
  });
}

async function flows() {
  const open = await isOpen();
  return cached('flows', ttl(open, 10 * 60e3, 30 * 60e3), async () => {
    const rows = await nseApi('fiidiiTradeReact');
    const pick = (re) => {
      const r = (rows || []).find((x) => re.test(x.category || ''));
      return r ? { date: r.date, buy: parseFloat(r.buyValue), sell: parseFloat(r.sellValue), net: parseFloat(r.netValue) } : null;
    };
    return { fii: pick(/FII|FPI/i), dii: pick(/DII/i) };
  });
}

async function quotes() {
  const open = await isOpen();
  const out = {};
  const errors = [];
  await Promise.all(SCREENER.map(async (s) => {
    const head = await cached('bse:head:' + s.bse, ttl(open, 20e3, 5 * 60e3), async () => {
      const d = await bseApi(`getScripHeaderData/w?Debtflag=&scripcode=${s.bse}&seriesid=`);
      const h = d.Header || {}, c = d.CurrRate || {};
      return {
        ltp: parseFloat(c.LTP) || parseFloat(h.LTP) || null,
        change: parseFloat(c.Chg), pct: parseFloat(c.PcChg),
        open: parseFloat(h.Open) || null, high: parseFloat(h.High) || null, low: parseFloat(h.Low) || null,
        prevClose: parseFloat(h.PrevClose) || null,
        name: (d.Cmpname || {}).FullN || s.sym,
      };
    });
    const fund = await cached('bse:fund:' + s.bse, 6 * 3600e3, async () => {
      const [h, t, hl] = await Promise.all([
        bseApi(`ComHeadernew/w?quotetype=EQ&scripcode=${s.bse}&seriesid=`),
        bseApi(`StockTrading/w?flag=&quotetype=EQ&scripcode=${s.bse}`),
        bseApi(`HighLow/w?Type=EQ&flag=C&scripcode=${s.bse}`),
      ]);
      const pick = (con, standalone) => {
        const c = parseFloat(con), a = parseFloat(standalone);
        return Number.isFinite(c) && c > 0 ? { value: c, basis: 'consolidated' } : Number.isFinite(a) && a > 0 ? { value: a, basis: 'standalone' } : null;
      };
      return {
        securityId: h.SecurityId,
        pe: pick(h.ConPE, h.PE), eps: pick(h.ConEPS, h.EPS), pb: pick(h.ConPB, h.PB), roe: pick(h.ConROE, h.ROE),
        npm: parseFloat(h.NPM) || null, opm: parseFloat(h.OPM) || null,
        industry: h.Industry || '', sector: h.Sector || '', faceValue: parseFloat(h.FaceVal) || null,
        mcapCr: parseFloat(String(t.MktCapFull || '').replace(/,/g, '')) || null,
        high52: parseFloat(hl.Fifty2WkHigh_adj) || null, low52: parseFloat(hl.Fifty2WkLow_adj) || null,
        weekRange: hl.WeekHighLow || null,
      };
    });
    if (head.error) errors.push(`${s.sym} quote: ${head.error}`);
    if (fund.error) errors.push(`${s.sym} fundamentals: ${fund.error}`);
    out[s.sym] = {
      sym: s.sym, sectorIndex: s.sectorIndex, sector: s.sector,
      quote: head.value, quoteAt: head.at, quoteStale: head.stale,
      fundamentals: fund.value, fundamentalsAt: fund.at,
    };
  }));
  return { stocks: out, errors };
}

async function optionChain() {
  const open = await isOpen();
  const exp = await cached('opt:expiries', 60 * 60e3, async () => {
    const d = await nseApi('option-chain-contract-info?symbol=NIFTY', 'https://www.nseindia.com/option-chain');
    return d.expiryDates || [];
  });
  const dates = exp.value || [];
  const today = istMidnight();
  let chosen = dates.find((d) => parseNseDate(d) > today) || dates.find((d) => parseNseDate(d) === today) || dates[0];
  if (!chosen) return { value: null, error: exp.error || 'no expiries', at: Date.now() };
  return cached('opt:chain:' + chosen, ttl(open, 30e3, 10 * 60e3), async () => {
    const d = await nseApi(`option-chain-v3?type=Indices&symbol=NIFTY&expiry=${encodeURIComponent(chosen)}`, 'https://www.nseindia.com/option-chain');
    const rec = d.records || {};
    const strikes = (rec.data || [])
      .map((r) => ({
        K: r.strikePrice ?? (r.CE || r.PE || {}).strikePrice,
        ce: r.CE ? { ltp: r.CE.lastPrice, iv: r.CE.impliedVolatility, oi: r.CE.openInterest, chgOi: r.CE.changeinOpenInterest, vol: r.CE.totalTradedVolume } : null,
        pe: r.PE ? { ltp: r.PE.lastPrice, iv: r.PE.impliedVolatility, oi: r.PE.openInterest, chgOi: r.PE.changeinOpenInterest, vol: r.PE.totalTradedVolume } : null,
      }))
      .filter((r) => r.K)
      .sort((a, b) => a.K - b.K);
    return { source: 'live', expiry: chosen, timestamp: rec.timestamp || '', und: rec.underlyingValue ?? null, strikes };
  });
}

module.exports = { market, indices, flows, quotes, optionChain, isOpen };
