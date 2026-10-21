// Market data for the whole app: the same boot sequence as the original public/app.js
// (live -> end-of-day -> quotes and options), then live updates over Server-Sent Events
// from /api/stream, with plain polling as the fallback.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../lib/api.js';
import { istToday } from '../lib/format.js';
import { rsiSeries } from '../lib/quant.js';

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }) {
  const [live, setLive] = useState(null);
  const [eod, setEod] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [opt, setOpt] = useState(null);
  const [optLoaded, setOptLoaded] = useState(false);
  const [errors, setErrors] = useState([]);
  const [eodProgress, setEodProgress] = useState(null);
  const liveRef = useRef(null);
  const errRef = useRef({ live: [], quotes: [] });

  const pushErrors = useCallback(() => {
    setErrors(errRef.current.live.concat(errRef.current.quotes.slice(0, 1)));
  }, []);
  const applyLive = useCallback((body) => {
    liveRef.current = body;
    setLive(body);
    errRef.current.live = (body.errors || []).slice();
    pushErrors();     // quote errors are kept until the next quotes update (the stream only sends changes)
  }, [pushErrors]);
  const applyQuotes = useCallback((body) => {
    setQuotes(body);
    errRef.current.quotes = body.errors && body.errors.length ? body.errors.slice(0, 1) : [];
    pushErrors();
  }, [pushErrors]);
  const applyOptions = useCallback((body) => {
    setOpt(body && body.strikes ? body : null);
    setOptLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true, pollTimer = 0, optTimer = 0, source = null;
    const marketOpen = () => !!(liveRef.current && liveRef.current.market && liveRef.current.market.open);
    const failing = () => errRef.current.live.length + errRef.current.quotes.length > 0;

    function loadEod() {
      return getJson('/api/eod').then((r) => {
        if (!alive) return null;
        if (r.status === 202 || (r.body && r.body.building)) {
          setEodProgress({ done: r.body.done || 0, total: r.body.total || '?' });
          return new Promise((res) => { setTimeout(() => res(loadEod()), 2000); });
        }
        setEodProgress(null);
        setEod(r.body);
        return r.body;
      });
    }
    function pollOptions() {
      getJson('/api/options').then((r) => alive && applyOptions(r.body)).catch(() => {}).finally(() => {
        if (alive) optTimer = setTimeout(pollOptions, failing() ? 15000 : marketOpen() ? 30000 : 60000);
      });
    }
    function pollLive() {     // fallback when the event stream is unavailable
      Promise.all([
        getJson('/api/live').then((r) => alive && applyLive(r.body)).catch(() => {}),
        getJson('/api/quotes').then((r) => alive && applyQuotes(r.body)).catch(() => {}),
      ]).then(() => { if (alive) pollTimer = setTimeout(pollLive, failing() ? 15000 : marketOpen() ? 30000 : 60000); });
    }
    function stream() {
      if (!window.EventSource) { pollLive(); return; }
      source = new EventSource('/api/stream');
      source.addEventListener('live', (e) => alive && applyLive(JSON.parse(e.data)));
      source.addEventListener('quotes', (e) => alive && applyQuotes(JSON.parse(e.data)));
      source.onerror = () => {
        if (source && source.readyState === EventSource.CLOSED) { source = null; if (alive) pollLive(); }
      };
    }

    getJson('/api/live').then((r) => alive && applyLive(r.body)).then(loadEod).then(() => Promise.all([
      getJson('/api/quotes').then((r) => alive && applyQuotes(r.body)),
      getJson('/api/options').then((r) => alive && applyOptions(r.body)),
    ])).then(() => {
      if (!alive) return;
      stream();
      optTimer = setTimeout(pollOptions, 20000);
    }).catch((e) => {
      errRef.current.live = [String((e && e.message) || e)];
      pushErrors();
    });
    return () => { alive = false; clearTimeout(pollTimer); clearTimeout(optTimer); if (source) source.close(); };
  }, [applyLive, applyQuotes, applyOptions, pushErrors]);

  /* derived helpers, as in the original */
  const helpers = useMemo(() => {
    const marketOpen = () => { const m = live && live.market; return !!(m && m.open); };
    const stk = (sym) => eod && eod.stocks[sym];
    const qt = (sym) => quotes && quotes.stocks && quotes.stocks[sym];
    const lastPrice = (sym) => { const q = qt(sym); if (q && q.quote && q.quote.ltp) return q.quote.ltp; const s = stk(sym); return s ? s.c[s.c.length - 1] : null; };
    const dayPct = (sym) => { const q = qt(sym); if (q && q.quote && Number.isFinite(q.quote.pct)) return q.quote.pct; const s = stk(sym); return s ? (s.c[s.c.length - 1] / s.c[s.c.length - 2] - 1) * 100 : null; };
    const seriesLive = (sym) => {
      const s = stk(sym); if (!s) return null;
      const c = s.c.slice(), d = s.dates.slice(), lp = lastPrice(sym);
      if (lp && d[d.length - 1] !== istToday() && marketOpen()) { c.push(lp); d.push(istToday()); }
      else if (lp && d[d.length - 1] === istToday()) { c[c.length - 1] = lp; }
      return { c, d };
    };
    const liveRsi = (sym) => { const s = seriesLive(sym); if (!s) return null; const r = rsiSeries(s.c); return r[r.length - 1]; };
    const sectorPE = (sym) => { const s = stk(sym); if (!s || !live || !live.indices) return null; const ix = live.indices[s.sectorIndex]; return ix ? ix.pe : null; };
    const symbols = () => (eod ? Object.keys(eod.stocks) : []);
    const fund = (sym, key) => { const q = qt(sym); return q && q.fundamentals ? q.fundamentals[key] : null; };
    const liveMood = () => {
      if (!live || !live.indices) return null;
      const ix = live.indices['NIFTY 500'] || live.indices['NIFTY 50'], vixI = live.indices['INDIA VIX'], fl = live.flows;
      if (!ix || !vixI) return null;
      const ad = ix.declines ? ix.advances / ix.declines : 1;
      return { ad, fii: fl && fl.fii ? fl.fii.net : 0, dii: fl && fl.dii ? fl.dii.net : 0, vix: vixI.last, date: fl && fl.fii ? fl.fii.date : '' };
    };
    return { marketOpen, stk, qt, lastPrice, dayPct, seriesLive, liveRsi, sectorPE, symbols, fund, liveMood };
  }, [live, eod, quotes]);

  const value = useMemo(() => ({ live, eod, quotes, opt, optLoaded, errors, eodProgress, ...helpers }),
    [live, eod, quotes, opt, optLoaded, errors, eodProgress, helpers]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
