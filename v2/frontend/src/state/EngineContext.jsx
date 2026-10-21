// The regime engine (FIG. 1 and everything that reads it), ported from the `EG` / `fig`
// singletons of the original public/app.js into React state. Same computations, same order.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clamp } from '../lib/format.js';
import { corrDist, logRet, mds, persistence } from '../lib/quant.js';
import { useData } from './DataContext.jsx';

export const REG = {
  calm: { name: 'Calm', surf: 'fundamentals and chart patterns, as taught', href: '#tools/t-screen', tool: 'Stock health scorecard', note: 'Sectors are moving apart: stock-specific work pays off.' },
  trans: { name: 'Transitional', surf: 'tighter stops and a breadth check before any breakout', href: '#tools/t-position', tool: 'Position calculator', note: 'Correlations are middling and drifting: confirm breakouts.' },
  stress: { name: 'Stress', surf: 'smaller positions, option hedges and the panic-selling lesson', href: '#tools/t-options', tool: 'Option simulator', note: 'Sectors are moving as one: diversification is not helping today.' },
};

const EngineCtx = createContext(null);
export const useEngine = () => useContext(EngineCtx);

function analyse(EG, idx) {
  const s = EG.series[idx], cd = corrDist(EG.R, s.end, EG.win);
  const ph = persistence(cd.D);
  const maxD = Math.max.apply(null, ph.E.map((e) => e.d));
  const h0Rows = ph.h0.slice().sort((a, b) => b.d - a.d);
  const h1Rows = ph.h1.filter((b) => b.d - b.b > 0.02).sort((a, b) => (b.d - b.b) - (a.d - a.b)).slice(0, 6);
  return { idx, D: cd.D, rho: cd.rho, pts: mds(cd.D), ph, maxD, h0Rows, h1Rows, main: h1Rows.length ? h1Rows[0] : null };
}

export function EngineProvider({ children }) {
  const { eod } = useData();
  const [EG, setEG] = useState(null);
  const [fig, setFig] = useState(null);         // the analysed window
  const [epsRaw, setEpsRaw] = useState(80);     // slider value, hundredths of ε
  const [epsMax, setEpsMax] = useState(200);
  const [home, setHome] = useState(null);       // what the home card and weather show (latest live window)
  const [scanRegime, setScanRegime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const livePRef = useRef(null);
  const egRef = useRef(null);
  const animRef = useRef(0);
  const builtFor = useRef(null);

  const regimeOf = useCallback((rho, eg) => { const g = eg || egRef.current; return rho < g.p33 ? 'calm' : rho < g.p67 ? 'trans' : 'stress'; }, []);

  const selectWindow = useCallback((i, resetEps, egArg) => {
    const g = egArg || egRef.current;
    if (!g) return;
    const idx = clamp(i, 0, g.series.length - 1);
    const a = analyse(g, idx);
    setFig(a);
    const max = Math.ceil(a.maxD * 100);
    setEpsMax(max);
    if (resetEps) {
      const e0 = a.main ? a.main.b + (a.main.d - a.main.b) * 0.45 : a.maxD * 0.55;
      setEpsRaw(Math.round(e0 * 100));
    }
    if (idx === g.series.length - 1 && g.live) setHome({ key: regimeOf(a.rho, g), rho: a.rho, h0Rows: a.h0Rows, main: a.main, maxD: a.maxD });
  }, [regimeOf]);

  const buildFrom = useCallback((edates, esectors, label, isLive, winOverride) => {
    if (!esectors || !esectors.length) return null;
    const R = esectors.map((s) => logRet(s.c));
    const win = winOverride || 60, first = win - 1, series = [];
    for (let e = first; e < R[0].length; e++) series.push({ end: e, date: edates[e + 1], rho: corrDist(R, e, win).rho });
    const sorted = series.map((x) => x.rho).slice().sort((a, b) => a - b);
    const p33 = sorted[Math.floor(sorted.length * 0.33)], p67 = sorted[Math.floor(sorted.length * 0.67)];
    if (isLive) livePRef.current = { p33, p67 };
    const useP = isLive || !livePRef.current ? { p33, p67 } : livePRef.current;
    const g = { R, win, series, p33: useP.p33, p67: useP.p67, ownP33: p33, ownP67: p67, live: !!isLive, label,
      codes: esectors.map((s) => s.code), names: esectors.map((s) => s.name), nSectors: esectors.length };
    egRef.current = g;
    setEG(g);
    selectWindow(series.length - 1, true, g);
    return g;
  }, [selectWindow]);

  const buildLive = useCallback(() => {
    if (!eod) return null;
    return buildFrom(eod.dates, eod.sectors, 'Last two years · NSE sector indices', true);
  }, [eod, buildFrom]);

  useEffect(() => {
    if (!eod || builtFor.current === eod) return;
    builtFor.current = eod;
    const g = buildLive();
    if (g) {
      const key = regimeOf(g.series[g.series.length - 1].rho, g);
      setScanRegime(REG[key]);
    }
  }, [eod, buildLive, regimeOf]);

  const stopPlay = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; }
    setPlaying(false);
  }, []);
  const togglePlay = useCallback(() => {
    if (animRef.current) { stopPlay(); return; }
    const g = egRef.current;
    if (!g) return;
    setPlaying(true);
    let i = (fig && fig.idx >= g.series.length - 1) ? 0 : (fig ? fig.idx : 0), last = 0;
    const step = (ts) => {
      if (ts - last > 60) { last = ts; selectWindow(i, false); i++; }
      if (i >= g.series.length) { stopPlay(); return; }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, [fig, selectWindow, stopPlay]);
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const value = useMemo(() => ({
    EG, fig, eps: epsRaw / 100, epsRaw, epsMax, setEpsRaw, home, scanRegime, playing,
    selectWindow, buildFrom, buildLive, regimeOf, togglePlay, stopPlay,
  }), [EG, fig, epsRaw, epsMax, home, scanRegime, playing, selectWindow, buildFrom, buildLive, regimeOf, togglePlay, stopPlay]);
  return <EngineCtx.Provider value={value}>{children}</EngineCtx.Provider>;
}

/* the sectors a loop runs through, ordered around their centre (original cycleSectors) */
export function cycleSectors(bar, fig, EG) {
  const vs = {};
  bar.cycle.forEach((ei) => { vs[fig.ph.E[ei].i] = 1; vs[fig.ph.E[ei].j] = 1; });
  const ids = Object.keys(vs).map(Number);
  const mx = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const cx = mx(ids.map((i) => fig.pts[i][0])), cy = mx(ids.map((i) => fig.pts[i][1]));
  ids.sort((a, b) => Math.atan2(fig.pts[b][1] - cy, fig.pts[b][0] - cx) - Math.atan2(fig.pts[a][1] - cy, fig.pts[a][0] - cx));
  return ids.map((i) => EG.codes[i]);
}
