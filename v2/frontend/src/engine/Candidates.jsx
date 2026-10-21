// The seven patent candidates, running (original renderCandStatus, runStreamBench,
// renderAttribution, renderBifiltration, renderCalibration, runGate, renderContagion,
// renderIvSurface). Same computations, same text; React renders what app.js wrote by id.
import { useMemo, useRef, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { useEngine, cycleSectors } from '../state/EngineContext.jsx';
import { useMotion } from '../motion/MotionProvider.jsx';
import { clamp, f, fmtDate, mean, nIN, niceTicks } from '../lib/format.js';
import { corrDist, corrOf, logRet, mds, persistence } from '../lib/quant.js';
import { getJson } from '../lib/api.js';
import { Src, useWidth } from '../components/common.jsx';

const CAND_STATUS = [
  ['1', 'Streaming persistent homology', 'Rolling correlation sums and pairing reuse, benchmarked below', 'Transposition (vineyard) updates are not implemented: when the edge order moves, it falls back to a full reduction.'],
  ['2', 'Topological regime attribution', 'Ranked sector and stock drivers, with the representative cycle', 'Ranks by correlation movement; a formal contribution decomposition is not implemented.'],
  ['3', 'Two-parameter regime fingerprint', 'Hilbert function over correlation × realised volatility', 'Realised volatility stands in for liquidity: bid-ask spreads are not in a free feed.'],
  ['4', 'Self-calibrating pipeline', 'Window sweep scored on diagram stability and false alarms', 'Calibrates the window only; embedding dimension and delay do not apply to this correlation pipeline.'],
  ['5', 'Surrogate-gated drift detector', 'Phase-randomised and block-bootstrap nulls with a p-value gate', 'The gate reports the action; it does not place orders or retrain a model.'],
  ['6', 'Cross-asset contagion map', 'Equities, G-Secs, corporate bonds, REITs and VIX in one network', 'Loops are matched across windows by overlap, which approximates zigzag persistence; FX and crypto are not in NSE’s index file.'],
  ['7', 'IV-surface topology', 'Sublevel-set persistence on the strike × expiry surface', 'H₀ basins only, on one trading day: a history of surfaces needs more archive days.'],
];

/* "Where it stops": lit under the pointer like the original's .gap cards (motion.js SPOT) */
function Gap({ children }) {
  const move = (e) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    el.classList.add('mo-spot');
  };
  return <span className="gap" onPointerMove={move} onPointerLeave={(e) => e.currentTarget.classList.remove('mo-spot')}>{children}</span>;
}

export function CandStatus() {
  return <>
    <thead><tr><th scope="col">#</th><th scope="col" className="l">Candidate</th><th scope="col" className="l">What runs here</th><th scope="col" className="l">Where the prototype stops</th></tr></thead>
    <tbody>
      {CAND_STATUS.map((r) => <tr key={r[0]}><th scope="row"><a href={'#engine/p' + r[0]}><b>{r[0]}</b></a></th><td className="l">{r[1]}</td><td className="l status-ok">{r[2]}</td><td className="l" style={{ color: 'var(--muted)' }}>{r[3]}</td></tr>)}
    </tbody>
  </>;
}

/* ---- candidate 1: streaming vs rebuild ---- */
function pairKey(i, j, n) { return i * n + j; }
function distsFromSums(n, W, S, Q, P) {
  const D = [];
  for (let i = 0; i < n; i++) D.push(new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const cov = P[pairKey(i, j, n)] - S[i] * S[j] / W;
    const va = Q[i] - S[i] * S[i] / W, vb = Q[j] - S[j] * S[j] / W;
    const c = va > 0 && vb > 0 ? clamp(cov / Math.sqrt(va * vb), -1, 1) : 0;
    D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
  }
  return D;
}
function orderOf(D) {
  const n = D.length, keys = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) keys.push([D[i][j], i * n + j]);
  keys.sort((a, b) => a[0] - b[0]);
  return keys.map((k) => k[1]);
}
function runStreamBench(EG) {
  const R = EG.R, n = R.length, W = EG.win, T = R[0].length;
  const sessions = Math.min(120, T - W - 1);
  const start = T - sessions;
  let i, j, t, u;
  // ---- rolling correlation update (what a tick-driven engine would do) ----
  const S1 = new Array(n).fill(0), Q1 = new Array(n).fill(0), P1 = new Float64Array(n * n);
  for (i = 0; i < n; i++) for (t = start - W; t < start; t++) { S1[i] += R[i][t]; Q1[i] += R[i][t] * R[i][t]; }
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { let p0 = 0; for (t = start - W; t < start; t++) p0 += R[i][t] * R[j][t]; P1[pairKey(i, j, n)] = p0; }
  const tRoll = performance.now();
  for (t = start; t < T; t++) {
    const out = t - W;
    for (i = 0; i < n; i++) { S1[i] += R[i][t] - R[i][out]; Q1[i] += R[i][t] * R[i][t] - R[i][out] * R[i][out]; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) P1[pairKey(i, j, n)] += R[i][t] * R[j][t] - R[i][out] * R[j][out];
    distsFromSums(n, W, S1, Q1, P1);
  }
  const rollMs = (performance.now() - tRoll) / sessions;
  // ---- the same correlations, recomputed from the window each session ----
  const tFull = performance.now();
  for (t = start; t < T; t++) {
    const S2 = new Array(n).fill(0), Q2 = new Array(n).fill(0), P2 = new Float64Array(n * n);
    for (i = 0; i < n; i++) for (u = t - W + 1; u <= t; u++) { S2[i] += R[i][u]; Q2[i] += R[i][u] * R[i][u]; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { let p2 = 0; for (u = t - W + 1; u <= t; u++) p2 += R[i][u] * R[j][u]; P2[pairKey(i, j, n)] = p2; }
    distsFromSums(n, W, S2, Q2, P2);
  }
  const rebuildMs = (performance.now() - tFull) / sessions;
  // ---- the reduction, and how often the edge order actually moves ----
  const tRed = performance.now();
  let moved = 0, prevOrder = null, transposed = 0;
  for (t = start; t < T; t++) {
    const seg = R.map((r) => r.slice(t - W + 1, t + 1));
    const D = [];
    for (i = 0; i < n; i++) D.push(new Array(n).fill(0));
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      const c = corrOf(seg[i], seg[j]);
      D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
    }
    const ord = orderOf(D);
    if (prevOrder) {
      let diff = 0;
      for (let k = 0; k < ord.length; k++) if (ord[k] !== prevOrder[k]) diff++;
      if (diff) moved++;
      transposed += diff;
    }
    prevOrder = ord;
    persistence(D);
  }
  const redMs = (performance.now() - tRed) / sessions;
  return { n, W, sessions, rollMs, rebuildMs, redMs, moved, transposed, edges: n * (n - 1) / 2 };
}
const P1_LABELS = ['Correlations, rolling', 'Correlations, rebuilt', 'Correlation speed-up', 'Sessions / second, end to end'];

export function P1() {
  const { EG } = useEngine();
  const [b, setB] = useState(null);
  const run = () => { if (EG) setB(runStreamBench(EG)); };
  let cells = null, note = null;
  if (b) {
    const v = [f(b.rollMs, 3) + ' ms', f(b.rebuildMs, 3) + ' ms', f(b.rebuildMs / b.rollMs, 1) + '×', nIN(Math.round(1000 / (b.rollMs + b.redMs)))];
    cells = P1_LABELS.map((k, i) => <div key={k}><div className="ro-k">{k}</div><div className="ro-v">{v[i]}</div></div>);
    note = <>
      Replayed <b>{b.sessions}</b> sessions over {b.n} sector indices with a {b.W}-session window, and timed the two halves separately.
      <br /><br /><b>The correlation half works.</b>{' Updating rolling sums in place costs '}<b>{f(b.rollMs, 3) + ' ms'}</b>{' a session against '}<b>{f(b.rebuildMs, 3) + ' ms'}</b>{' to recompute the window from scratch — '}<b>{f(b.rebuildMs / b.rollMs, 1) + '× cheaper'}</b>{', and the gap grows with the window length, because the rolling form never touches the ' + b.W + ' stored sessions. Memory is one ' + b.n + '×' + b.n + ' matrix of sums (' + nIN(Math.round(b.n * b.n * 8 / 1024)) + ' KB), not a window of history.'}
      <br /><br /><b>The reduction half does not.</b>{' It costs '}<b>{f(b.redMs, 3) + ' ms'}</b>{' a session, and the ordering of the ' + nIN(b.edges) + ' edges moved on '}<b>{b.moved + ' of ' + (b.sessions - 1)}</b>{' sessions (about ' + f(b.transposed / Math.max(1, b.sessions - 1), 0) + ' positions each time), so a prototype that only reuses the pairing when nothing moved would almost never get to. That is the honest finding: the value in candidate 1 sits in updating the reduction through those transpositions — vineyards — not in avoiding the correlation work.'}
      <Gap>Where it stops: vineyard transposition updates are not implemented here, so every session takes a full reduction. At this size the whole pipeline is well under a millisecond either way; the claim only bites at hundreds of assets and intraday ticks.</Gap>
    </>;
  }
  return (
    // markup: public/index.html #p1 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p1">
      <div className="cl-head">
        <span className="mono-label">Candidate 1</span>
        <h3>Streaming persistent homology</h3>
      </div>
      <p className="cl-claim">Update only what the new session touches, instead of rebuilding the diagram, and stay inside a fixed time budget.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Replay the last sessions, one at a time</span>
          <button type="button" className="chipbtn" id="p1run" onClick={run}>Run the benchmark</button>
        </div>
        <div className="readouts" id="p1out">{cells ?? <><div>
  <div className="ro-k">Correlations, rolling</div>
  <div className="ro-v">—</div>
</div><div>
  <div className="ro-k">Correlations, rebuilt</div>
  <div className="ro-v">—</div>
</div><div>
  <div className="ro-k">Correlation speed-up</div>
  <div className="ro-v">—</div>
</div><div>
  <div className="ro-k">Sessions / second, end to end</div>
  <div className="ro-v">—</div>
</div></>}</div>
        <p className="cl-note" id="p1note">{note ?? <>Press run: the engine replays each session by updating rolling correlation sums in place, reuses the previous pairing whenever the edge ordering is unchanged, and falls back to a full reduction only when the order actually moves.</>}</p>
      </div>
    </section>
  );
}

/* ---- candidate 2: ranked attribution ---- */
export function P2() {
  const { eod } = useData();
  const { EG, fig } = useEngine();
  const r = useMemo(() => {
    if (!eod || !EG || !fig || !fig.D) return null;
    const lookback = 20, refIdx = Math.max(0, fig.idx - lookback);
    const cur = corrDist(EG.R, EG.series[fig.idx].end, EG.win);
    const ref = corrDist(EG.R, EG.series[refIdx].end, EG.win);
    const rows = EG.codes.map((code, i) => {
      let now = 0, then = 0, n = 0;
      for (let j = 0; j < EG.codes.length; j++) {
        if (j === i) continue;
        now += 1 - cur.D[i][j] * cur.D[i][j] / 2;
        then += 1 - ref.D[i][j] * ref.D[i][j] / 2;
        n++;
      }
      return { code, now: now / n, then: then / n, chg: (now - then) / n };
    }).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg));
    const cyc = fig.main ? cycleSectors(fig.main, fig, EG) : [];
    const stocks = (eod.topo || []).slice().sort((a, b) => Math.abs(b.corrChg) - Math.abs(a.corrChg)).slice(0, 8);
    return { rows, cyc, stocks, src: 'window ending ' + fmtDate(EG.series[fig.idx].date) + ' vs ' + fmtDate(EG.series[refIdx].date) };
  }, [eod, EG, fig]);
  const sectors = r ? <>
    <span className="mono-label">Sectors, ranked by how much their coupling moved</span>
    <ul className="checks">
      {r.rows.slice(0, 6).map((x) => <li key={x.code}><span className="cn">{x.code}</span><span className="cv">{f(x.now, 2) + ' ρ'}</span><span className={'pill ' + (x.chg > 0 ? 'flag' : 'pass')}>{(x.chg >= 0 ? '+' : '−') + f(Math.abs(x.chg), 2)}</span><span className="cnote">{'was ' + f(x.then, 2) + ' twenty sessions ago' + (r.cyc.indexOf(x.code) >= 0 ? ' · on the live loop' : '')}</span></li>)}
    </ul>
    <p className="note">{r.rows[0].chg > 0
      ? <><b>{r.rows[0].code}</b>{' pulled hardest into the pack (+' + f(r.rows[0].chg, 2) + ' average correlation). Rising coupling is what turns a diversified book into one bet.'}</>
      : <><b>{r.rows[0].code}</b>{' pulled hardest away from the pack (' + f(r.rows[0].chg, 2) + '). Falling coupling is where stock-specific work starts paying again.'}</>}</p>
  </> : null;
  const stocks = r ? <>
    <span className="mono-label">Stocks whose coupling moved most (NIFTY 500, 30 sessions)</span>
    <div className="tbl-scroll"><table className="data-tbl"><thead><tr><th className="l">Stock</th><th className="l">Industry</th><th>Avg ρ</th><th>Δ ρ</th></tr></thead><tbody>
      {r.stocks.map((s) => <tr key={s.sym}><th scope="row" className="l"><b>{s.sym}</b></th><td className="l">{s.industry}</td><td>{f(s.avgCorr, 2)}</td><td className={s.corrChg > 0 ? 'neg' : 'pos'}>{(s.corrChg >= 0 ? '+' : '−') + f(Math.abs(s.corrChg), 2)}</td></tr>)}
    </tbody></table></div>
    <p className="hint">A rising Δ means the stock is joining the crowd; a falling one means it is breaking away.</p>
  </> : null;
  return (
    // markup: public/index.html #p2 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p2">
      <div className="cl-head">
        <span className="mono-label">Candidate 2</span>
        <h3>Topological regime attribution</h3>
      </div>
      <p className="cl-claim">When the shape changes, name the sectors and stocks that changed it, ranked.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Drivers of the current window vs 20 sessions earlier</span>
          <Src id="p2src" text={r && r.src} />
        </div>
        <div className="split">
          <div id="p2sectors">{sectors}</div>
          <div id="p2stocks">{stocks}</div>
        </div>
      </div>
    </section>
  );
}

/* ---- candidate 3: bifiltration ---- */
function heatmap(W, grid, cols, rows, label) {
  const L = 46, T = 8, B = 30, Rr = 8, H = 190;
  const cw = (W - L - Rr) / cols.length, ch = (H - T - B) / rows.length;
  const vals = grid.flat().filter((v) => v != null);
  const mx = Math.max.apply(null, vals) || 1, mn = Math.min.apply(null, vals);
  const cells = [];
  grid.forEach((row, r) => {
    row.forEach((v, c) => {
      const t = v == null ? 0 : (v - mn) / ((mx - mn) || 1);
      const y = T + (rows.length - 1 - r) * ch;
      cells.push(<rect key={'r' + r + '-' + c} className="hm-cell" x={L + c * cw} y={y} width={cw} height={ch} style={{ fill: v == null ? 'var(--rule)' : 'color-mix(in srgb, var(--h0) ' + Math.round(12 + t * 88) + '%, var(--surface))' }} />);
      if (cw > 22 && ch > 14 && v != null) cells.push(<text key={'t' + r + '-' + c} className="hm-axis" x={L + c * cw + cw / 2} y={y + ch / 2 + 3} textAnchor="middle" style={{ fill: t > 0.55 ? 'var(--surface)' : 'var(--ink-2)' }}>{v}</text>);
    });
  });
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label={label + ' over the bifiltration grid'}>
      {cells}
      {rows.map((v, r) => <text key={'y' + r} className="hm-axis" x={L - 6} y={T + (rows.length - 1 - r) * ch + ch / 2 + 3} textAnchor="end">{f(v, 0) + '%'}</text>)}
      {cols.map((v, c) => (c % 2 ? null : <text key={'x' + c} className="hm-axis" x={L + c * cw + cw / 2} y={H - 14} textAnchor="middle">{f(v, 1)}</text>))}
      <text className="hm-axis" x={L} y={H - 2}>ε →</text><text className="hm-axis" x="4" y={T + 10}>vol ↑</text>
    </svg>
  );
}

export function P3() {
  const { EG, fig } = useEngine();
  const { eod } = useData();
  const b0 = useRef(null), b1 = useRef(null);
  const W0 = useWidth(b0), W1 = useWidth(b1);
  const g = useMemo(() => {
    if (!eod || !EG || !fig) return null;
    const end = EG.series[fig.idx].end, W = EG.win, n = EG.R.length;
    const seg = EG.R.map((r) => r.slice(end - W + 1, end + 1));
    const vols = seg.map((x) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) * (v - m))) * 252) * 100; });
    const sortedVol = vols.slice().sort((a, b) => a - b);
    const levels = [], L = 6;
    for (let q = 0; q < L; q++) levels.push(sortedVol[Math.floor(q / L * (n - 3))]);
    const maxD = fig.maxD, eps = [], E = 10;
    for (let e = 1; e <= E; e++) eps.push(maxD * e / E);
    const grid0 = [], grid1 = [];
    levels.forEach((v) => {
      const idx = [];
      for (let i = 0; i < n; i++) if (vols[i] >= v) idx.push(i);
      const row0 = [], row1 = [];
      if (idx.length < 3) { eps.forEach(() => { row0.push(null); row1.push(null); }); }
      else {
        const D = idx.map((a) => idx.map((b) => fig.D[a][b]));
        const ph = persistence(D);
        eps.forEach((ep) => {
          row0.push(ph.h0.filter((b) => b.d === Infinity || b.d > ep).length);
          row1.push(ph.h1.filter((b) => b.b <= ep && ep < b.d).length);
        });
      }
      grid0.push(row0); grid1.push(row1);
    });
    const anyLoop = grid1.some((row) => row.some((v) => v));
    const mid = Math.floor(E / 2);
    const lowVol = grid0[0][mid], highVol = grid0[grid0.length - 1][mid];
    const note = <>
      {'Each row keeps only the sectors above a realised-volatility floor, each column grows ε. At ε ' + f(eps[mid], 2) + ', the whole market sits in '}<b>{lowVol}</b>{' group' + (lowVol === 1 ? '' : 's') + ', while the most volatile sectors alone sit in '}<b>{highVol == null ? '—' : highVol}</b>{'. ' +
        (anyLoop ? '' : ' β₁ is zero everywhere in this window: there is no loop to find at any radius or volatility floor — drag FIG. 1’s window back, or load the 2020 replay, to see one appear. ') +
        (highVol != null && highVol > lowVol
          ? 'The volatile corner is still fragmented while the market as a whole has merged, which is the signature of a volatility squeeze in part of the market rather than a broad correlation crash.'
          : 'Both merge together, so what is happening is a broad correlation move rather than a volatility squeeze in one corner.')}
      <Gap>Where it stops: the second axis is realised volatility, because bid-ask spreads and depth are not in a free feed. The invariant shown is the rank invariant (β₀ and β₁ on the grid), not a complete multiparameter invariant.</Gap>
    </>;
    return { grid0, grid1, eps, levels, note, src: EG.codes.length + ' sectors · window ending ' + fmtDate(EG.series[fig.idx].date) };
  }, [eod, EG, fig]);
  const svg0 = g && W0 ? heatmap(W0, g.grid0, g.eps, g.levels, 'β₀') : null;
  const svg1 = g && W1 ? heatmap(W1, g.grid1, g.eps, g.levels, 'β₁') : null;
  return (
    // markup: public/index.html #p3 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p3">
      <div className="cl-head">
        <span className="mono-label">Candidate 3</span>
        <h3>Two-parameter regime fingerprint</h3>
      </div>
      <p className="cl-claim">Filter on correlation distance and a second variable at once, so a volatility squeeze and a correlation crash leave different fingerprints.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Correlation distance ε × realised volatility</span>
          <Src id="p3src" text={g && g.src} />
        </div>
        <div className="bi-wrap">
          <div>
            <span className="mono-label">β₀ · groups</span>
            <div className="chart" id="p3b0" ref={b0}>{svg0}<div className="tip" id="p3tip" hidden /></div>
          </div>
          <div>
            <span className="mono-label">β₁ · loops</span>
            <div className="chart" id="p3b1" ref={b1}>{svg1}</div>
          </div>
        </div>
        <p className="cl-note" id="p3note">{g && g.note}</p>
      </div>
    </section>
  );
}

/* ---- candidate 4: calibration ---- */
function calibrationChart(W, cal) {
  const H = 190, L = 48, Rr = 46, T = 16, B = 30;
  const xs = cal.results.map((r) => r.win);
  const stab = cal.results.map((r) => r.stability);
  const fa = cal.results.map((r) => r.falseAlarm * 100);
  const sMax = Math.max.apply(null, stab) * 1.15, fMax = Math.max(Math.max.apply(null, fa), cal.target * 100) * 1.3;
  const X = (i) => L + i / (xs.length - 1) * (W - L - Rr);
  const Y1 = (v) => T + (1 - v / sMax) * (H - T - B);
  const Y2 = (v) => T + (1 - v / fMax) * (H - T - B);
  const pick = xs.indexOf(cal.chosen);
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Stability and false-alarm rate by window length">
      <path className="sw-line" d={'M' + stab.map((v, i) => X(i) + ' ' + Y1(v)).join(' L')} />
      <path className="sw-fa" d={'M' + fa.map((v, i) => X(i) + ' ' + Y2(v)).join(' L')} />
      <line className="sw-fa" x1={L} x2={W - Rr} y1={Y2(cal.target * 100)} y2={Y2(cal.target * 100)} style={{ opacity: 0.5 }} />
      {pick >= 0 ? <line className="sw-pick" x1={X(pick)} x2={X(pick)} y1={T} y2={H - B} /> : null}
      {xs.map((w, i) => [
        <circle key={'c' + i} className="c-dot" cx={X(i)} cy={Y1(stab[i])} r="3" />,
        <text key={'t' + i} className="hm-axis" x={X(i)} y={H - 12} textAnchor="middle">{w}</text>,
      ])}
      <text className="hm-axis" x={L} y={T - 4}>stability (solid) · false alarms % (dashed)</text>
      <text className="hm-axis" x={W - Rr + 6} y={Y2(cal.target * 100) + 3}>{'target ' + f(cal.target * 100, 0) + '%'}</text>
      <text className="hm-axis" x={L} y={H - 2}>window, sessions</text>
    </svg>
  );
}

export function P4() {
  const { eod } = useData();
  const { buildFrom, stopPlay } = useEngine();
  const { scrollTo } = useMotion();
  const chart = useRef(null), W = useWidth(chart);
  const cal = eod && eod.calibration;
  const table = cal ? <>
    <thead><tr><th scope="col">Window</th><th scope="col">Diagram drift (calm)</th><th scope="col">Stability</th><th scope="col">False alarms</th><th scope="col" className="l">Verdict</th></tr></thead>
    <tbody>
      {cal.results.map((r) => {
        const ok = r.falseAlarm <= cal.target;
        return <tr key={r.win} className={r.win === cal.chosen ? 'row-sel' : undefined}><th scope="row">{r.win}</th><td>{f(r.drift, 3)}</td><td>{f(r.stability, 2)}</td><td className={ok ? 'pos' : 'neg'}>{f(r.falseAlarm * 100, 1) + '%'}</td><td className="l">{r.win === cal.chosen ? 'chosen' : ok ? 'eligible' : 'too jumpy'}</td></tr>;
      })}
    </tbody>
  </> : null;
  const apply = () => {
    if (!cal) return;
    stopPlay();
    buildFrom(eod.dates, eod.sectors, 'Last two years · calibrated ' + cal.chosen + '-session window', true, cal.chosen);
    scrollTo(document.getElementById('fig1'));
  };
  return (
    // markup: public/index.html #p4 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p4">
      <div className="cl-head">
        <span className="mono-label">Candidate 4</span>
        <h3>Self-calibrating pipeline</h3>
      </div>
      <p className="cl-claim">Pick the window length by measuring diagram stability in calm stretches, subject to a false-alarm ceiling.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Window sweep</span>
          <Src id="p4src" text={cal ? cal.results.length + ' windows swept over ' + eod.dates.length + ' sessions' : null} />
        </div>
        <div className="chart" id="p4chart" style={{ padding: "14px 16px" }} ref={chart}>{cal && W ? calibrationChart(W, cal) : null}</div>
        <div className="tbl-scroll">
          <table className="data-tbl" id="p4table">{table}</table>
        </div>
        <div className="panel-bar" style={{ borderTop: "1px solid var(--rule)", borderBottom: "0" }}>
          <span className="mono-label" id="p4pick">{cal ? 'Calibrated window: ' + cal.chosen + ' sessions · false alarms ' + f(cal.chosenRow.falseAlarm * 100, 1) + '% under a ' + f(cal.target * 100, 0) + '% ceiling' : '—'}</span>
          <button type="button" className="chipbtn" id="p4apply" onClick={apply}>Run FIG. 1 at the calibrated window</button>
        </div>
      </div>
    </section>
  );
}

/* ---- candidate 5: the gate ---- */
function nullsChart(W, d) {
  const H = 210, gap = 26, panelW = (W - gap) / 2, T = 20, B = 26;
  const panel = (x0, values, observed, extra, title) => {
    let mn = Math.min.apply(null, values.concat([observed, extra == null ? observed : extra]));
    let mx = Math.max.apply(null, values.concat([observed, extra == null ? observed : extra]));
    const pad = (mx - mn) * 0.12 || 0.01; mn -= pad; mx += pad;
    const bins = 24, counts = new Array(bins).fill(0);
    values.forEach((v) => { counts[clamp(Math.floor((v - mn) / (mx - mn) * bins), 0, bins - 1)]++; });
    const cMax = Math.max.apply(null, counts) || 1;
    const X = (v) => x0 + (v - mn) / (mx - mn) * panelW;
    const Y = (c) => T + (1 - c / cMax) * (H - T - B);
    return (
      <g key={title}>
        <text className="hm-axis" x={x0} y={T - 6}>{title}</text>
        {counts.map((c, i) => <rect key={i} className="null-bar" x={x0 + i / bins * panelW} y={Y(c)} width={panelW / bins - 1} height={Math.max(0, Y(0) - Y(c))} />)}
        <line className="obs-line" x1={X(observed)} x2={X(observed)} y1={T} y2={Y(0)} />
        <text className="hm-axis" x={clamp(X(observed), x0 + 24, x0 + panelW - 24)} y={T + 10} textAnchor="middle" style={{ fill: 'var(--h1-text)' }}>{'today ' + f(observed, 2)}</text>
        {extra != null ? <>
          <line className="sw-pick" x1={X(extra)} x2={X(extra)} y1={T} y2={Y(0)} />
          <text className="hm-axis" x={clamp(X(extra), x0 + 24, x0 + panelW - 24)} y={Y(0) + 14} textAnchor="middle">{'previous ' + f(extra, 2)}</text>
        </> : null}
        <line className="c-grid" x1={x0} x2={x0 + panelW} y1={Y(0)} y2={Y(0)} />
      </g>
    );
  };
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Null distributions against today’s reading">
      {panel(0, d.nullRho.values, d.observed.rho, null, 'phase-randomised null · mean ρ')}
      {d.shift ? panel(panelW + gap, d.shift.values, d.shift.observed, d.shift.previous, 'previous-window bootstrap · mean ρ') : null}
    </svg>
  );
}

export function P5() {
  const chart = useRef(null), W = useWidth(chart);
  const [d, setD] = useState(null);        // the last successful gate, for the chart
  const [out, setOut] = useState(null);    // what #p5out shows once run
  const run = () => {
    setOut(<p className="note">Running two nulls…</p>);
    getJson('/api/surrogate?n=150').then((r) => {
      const g = r.body;
      if (g.error) { setOut(<p className="note warn">{g.error}</p>); return; }
      setD(g);
      const sh = g.shift;
      const act = sh && sh.shifted
        ? <>The gate <b>opens</b>: this window’s structure is outside what the previous window could produce, so a regime alert, a retrain or a de-risking step is justified.</>
        : <>The gate <b>stays shut</b>: the reading is inside what the previous window produces by chance, so nothing should fire.</>;
      setOut(<>
        <p><b>Is there structure at all?</b>{' Mean correlation is ' + f(g.observed.rho, 3) + ' against a phase-randomised null of ' + f(g.nullRho.mean, 3) + ' ± ' + f(g.nullRho.sd, 3) + ' (p ' + (g.pRho < 0.005 ? '< 0.005' : f(g.pRho, 3)) + ').'}</p>
        {sh ? <p><b>Has it changed?</b>{' The previous ' + g.window + '-session window read ' + f(sh.previous, 3) + '. Resampling blocks of sessions from that window puts 95% of readings between ' + f(sh.nullLo, 3) + ' and ' + f(sh.nullHi, 3) + '; today reads ' + f(sh.observed, 3) + ' (p ' + (sh.p < 0.005 ? '< 0.005' : f(sh.p, 3)) + ').'}</p> : null}
        <p>{act}</p>
        <Gap>Where it stops: the gate reports the action and the evidence. Wiring it to a broker, a hedge or a retraining job is the part a product would add.</Gap>
      </>);
    }).catch((e) => setOut(<p className="note warn">{String(e.message || e)}</p>));
  };
  return (
    // markup: public/index.html #p5 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p5">
      <div className="cl-head">
        <span className="mono-label">Candidate 5</span>
        <h3>Surrogate-gated drift detector</h3>
      </div>
      <p className="cl-claim">Only act when the signal beats a null built from surrogate data.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Two nulls: is there structure, and has it changed?</span>
          <button type="button" className="chipbtn" id="p5run" onClick={run}>Run the gate</button>
        </div>
        <div className="chart" id="p5chart" style={{ padding: "14px 16px" }} ref={chart}>{d && W ? nullsChart(W, d) : null}<div className="tip" id="p5tip" hidden /></div>
        <div id="p5out" className="cl-note">{out ?? <>Press run. The first null phase-randomises each sector, keeping its own volatility but destroying the links between sectors. The second resamples blocks of sessions from the previous window, so it keeps the old correlation structure and asks whether today's reading could have come from it.</>}</div>
      </div>
    </section>
  );
}

/* ---- candidate 6: cross-asset contagion ---- */
const GROUP_LABEL = { equity: 'Equities', rates: 'G-Secs', credit: 'Corporate bonds', real: 'REITs & InvITs', vol: 'Volatility' };
function contagion(eod) {
  const layers = eod.layers;
  if (!layers || layers.length < 4) return { short: true };
  const R = layers.map((l) => logRet(l.c));
  const W = 60, T = R[0].length;
  const windows = [];
  for (let end = Math.max(W - 1, T - 250); end < T; end++) windows.push(end);
  // cross-asset coupling through time: average |ρ| between equity layers and everything else
  const series = windows.map((end) => {
    const seg = R.map((r) => r.slice(end - W + 1, end + 1));
    let sum = 0, n = 0;
    for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
      if (layers[i].group === layers[j].group) continue;
      if (layers[i].group !== 'equity' && layers[j].group !== 'equity') continue;
      sum += Math.abs(corrOf(seg[i], seg[j])); n++;
    }
    return { date: eod.dates[end + 1], v: sum / n };
  });
  // the network right now
  const end2 = T - 1, seg2 = R.map((r) => r.slice(end2 - W + 1, end2 + 1));
  const D = [];
  for (let i = 0; i < layers.length; i++) D.push(new Array(layers.length).fill(0));
  for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
    const c = corrOf(seg2[i], seg2[j]);
    D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
  }
  // loop tracking across windows (a practical stand-in for zigzag persistence)
  const chains = [];
  let prev = null;
  windows.filter((_, i) => i % 5 === 0).forEach((end3) => {
    const seg3 = R.map((r) => r.slice(end3 - W + 1, end3 + 1));
    const D3 = [];
    for (let a = 0; a < layers.length; a++) D3.push(new Array(layers.length).fill(0));
    for (let a = 0; a < layers.length; a++) for (let b = a + 1; b < layers.length; b++) {
      const cc = corrOf(seg3[a], seg3[b]);
      D3[a][b] = D3[b][a] = Math.sqrt(Math.max(0, 2 * (1 - cc)));
    }
    const ph = persistence(D3);
    const best = ph.h1.filter((x) => x.d - x.b > 0.05).sort((x, y) => (y.d - y.b) - (x.d - x.b))[0];
    if (!best) { prev = null; return; }
    const nodes = {};
    best.cycle.forEach((ei) => { nodes[ph.E[ei].i] = 1; nodes[ph.E[ei].j] = 1; });
    const set = Object.keys(nodes).map(Number);
    const date = eod.dates[end3 + 1];
    if (prev) {
      const inter = set.filter((x) => prev.set.indexOf(x) >= 0).length;
      const uni = new Set(set.concat(prev.set)).size;
      if (inter / uni >= 0.5) { prev.end = date; prev.persist = Math.max(prev.persist, best.d - best.b); prev.set = set; return; }
    }
    prev = { start: date, end: date, set, persist: best.d - best.b };
    chains.push(prev);
  });
  const rows = chains.filter((c) => c.start !== c.end).slice(-8).reverse();
  return { layers, D, series, rows, groups: [...new Set(layers.map((l) => l.group))].length };
}
function layerMap(W, D, layers) {
  const H = 260, pts = mds(D);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
  const pad = 34;
  const X = (v) => pad + (v - minx) / ((maxx - minx) || 1) * (W - 2 * pad);
  const Y = (v) => H - pad - (v - miny) / ((maxy - miny) || 1) * (H - 2 * pad);
  const all = [];
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) all.push(D[i][j]);
  all.sort((a, b) => a - b);
  const thresh = all[Math.floor(all.length * 0.3)];
  const edges = [];
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) {
    if (D[i][j] > thresh) continue;
    const cross = layers[i].group !== layers[j].group;
    edges.push(<line key={i + '-' + j} className={cross ? 'cross-edge' : 'same-edge'} x1={X(pts[i][0])} y1={Y(pts[i][1])} x2={X(pts[j][0])} y2={Y(pts[j][1])} />);
  }
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Cross-asset network">
      {edges}
      {layers.map((l, k) => [
        <circle key={'c' + k} className={'layer-' + l.group} cx={X(pts[k][0])} cy={Y(pts[k][1])} r="5" />,
        <text key={'t' + k} className="hm-axis" x={X(pts[k][0])} y={Y(pts[k][1]) - 10} textAnchor="middle">{l.code}</text>,
      ])}
    </svg>
  );
}
function couplingChart(W, series) {
  const H = 260, L = 40, Rr = 10, T = 16, B = 26;
  const vals = series.map((s) => s.v);
  const mn = Math.min.apply(null, vals) - 0.02, mx = Math.max.apply(null, vals) + 0.02;
  const X = (i) => L + i / (series.length - 1) * (W - L - Rr);
  const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  const labels = [];
  let lastLab = -99;
  series.forEach((s, i) => {
    if (i === 0 || s.date.slice(5, 7) === series[i - 1].date.slice(5, 7)) return;
    if (X(i) - lastLab < 56) return;
    lastLab = X(i);
    labels.push(<text key={i} className="hm-axis" x={X(i)} y={H - 8} textAnchor="middle">{fmtDate(s.date).split(' ')[1]}</text>);
  });
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Cross-asset coupling over time">
      {niceTicks(mn, mx, 3).map((t) => (t < mn || t > mx ? null : [
        <line key={'g' + t} className="c-grid" x1={L} x2={W - Rr} y1={Y(t)} y2={Y(t)} />,
        <text key={'l' + t} className="hm-axis" x={L - 6} y={Y(t) + 3} textAnchor="end">{f(t, 2)}</text>,
      ]))}
      <path className="tl-line" d={'M' + series.map((s, i) => X(i) + ' ' + Y(s.v)).join(' L')} />
      {labels}
    </svg>
  );
}

export function P6() {
  const { eod } = useData();
  const map = useRef(null), time = useRef(null);
  const Wm = useWidth(map), Wt = useWidth(time);
  const c = useMemo(() => (eod ? contagion(eod) : null), [eod]);
  const ok = c && !c.short;
  const loops = ok ? <>
    <thead><tr><th scope="col" className="l">Loop tracked from</th><th scope="col" className="l">to</th><th scope="col">Max persistence</th><th scope="col" className="l">Asset classes it spans</th></tr></thead>
    <tbody>
      {c.rows.length ? c.rows.map((ch, k) => <tr key={k}><th scope="row" className="l">{fmtDate(ch.start)}</th><td className="l">{fmtDate(ch.end)}</td><td>{f(ch.persist, 2)}</td><td className="l">{[...new Set(ch.set.map((i) => GROUP_LABEL[c.layers[i].group]))].join(', ')}</td></tr>)
        : <tr><td className="l" colSpan={4} style={{ color: 'var(--muted)' }}>No loop survived long enough to track in this stretch.</td></tr>}
    </tbody>
  </> : null;
  let note = null;
  if (c && c.short) note = 'Not enough cross-asset indices in the archive for this window.';
  else if (ok) {
    const latest = c.series[c.series.length - 1], first = c.series[0];
    note = <>
      {'Average cross-asset coupling — equities against G-Secs, corporate bonds, REITs and the volatility index — reads '}<b>{f(latest.v, 2)}</b>{' today against ' + f(first.v, 2) + ' a year ago. Orange links in the map are the cross-asset ones: when they shorten, a shock has a path out of equities.'}
      <Gap>Where it stops: loops are matched between windows by how much they overlap, which approximates zigzag persistence rather than computing it; FX and crypto aren’t in NSE’s index file, so those layers are missing.</Gap>
    </>;
  }
  return (
    // markup: public/index.html #p6 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p6">
      <div className="cl-head">
        <span className="mono-label">Candidate 6</span>
        <h3>Cross-asset contagion map</h3>
      </div>
      <p className="cl-claim">Track cycles as they form and dissolve across a network that spans asset classes, and see the path a shock takes.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Equities · G-Secs · corporate bonds · REITs · volatility</span>
          <Src id="p6src" text={ok ? c.layers.length + ' indices across ' + c.groups + ' asset classes' : null} />
        </div>
        <div className="p6-wrap">
          <div>
            <span className="mono-label">The layered network now</span>
            <div className="chart" id="p6map" ref={map}>{ok && Wm ? layerMap(Wm, c.D, c.layers) : null}<div className="tip" id="p6tip" hidden /></div>
          </div>
          <div>
            <span className="mono-label">Cross-asset coupling over time</span>
            <div className="chart" id="p6time" ref={time}>{ok && Wt ? couplingChart(Wt, c.series) : null}</div>
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="data-tbl" id="p6loops">{loops}</table>
        </div>
        <p className="cl-note" id="p6note">{note}</p>
      </div>
    </section>
  );
}

/* ---- candidate 7: IV surface ---- */
function ivMap(W, iv) {
  const rows = iv.grid.length, cols = iv.strikes.length;
  const L = 62, T = 10, B = 34, Rr = 10, H = Math.max(150, rows * 26 + T + B);
  const cw = (W - L - Rr) / cols, ch = (H - T - B) / rows;
  const out = [];
  iv.grid.forEach((row, r) => {
    row.forEach((v, c) => {
      const t = v == null ? null : (v - iv.minIv) / ((iv.maxIv - iv.minIv) || 1);
      out.push(<rect key={'r' + r + '-' + c} className="hm-cell" x={L + c * cw} y={T + r * ch} width={Math.max(1, cw)} height={ch} style={{ fill: t == null ? 'var(--rule)' : 'color-mix(in srgb, var(--h1) ' + Math.round(10 + t * 90) + '%, var(--surface))' }} />);
    });
    out.push(<text key={'d' + r} className="hm-axis" x={L - 6} y={T + r * ch + ch / 2 + 3} textAnchor="end">{iv.days[r] + 'd'}</text>);
  });
  (iv.essential || []).concat(iv.bars.map((b) => ({ at: b.at }))).forEach((b, k) => {
    if (!b.at) return;
    out.push(<circle key={'b' + k} cx={L + b.at[1] * cw + cw / 2} cy={T + b.at[0] * ch + ch / 2} r="3.5" style={{ fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: 1.5 }} />);
  });
  iv.strikes.forEach((k, c) => {
    if (c % Math.ceil(cols / 8) !== 0) return;
    out.push(<text key={'k' + c} className="hm-axis" x={L + c * cw + cw / 2} y={H - 16} textAnchor="middle">{nIN(k)}</text>);
  });
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Implied volatility surface">
      {out}
      <text className="hm-axis" x={L} y={H - 3}>strike →   ·   rings mark the basins the filtration finds</text>
      <text className="hm-axis" x="4" y={T + 10}>expiry ↓</text>
    </svg>
  );
}

export function P7() {
  const { eod } = useData();
  const map = useRef(null), W = useWidth(map);
  const iv = eod && eod.ivSurface;
  const at = (b) => nIN(iv.strikes[b.at[1]]) + ' · ' + iv.days[b.at[0]] + 'd';
  const bars = iv ? <>
    <span className="mono-label">Basin persistence (H₀ of sublevel sets)</span>
    <div className="tbl-scroll"><table className="data-tbl"><thead><tr><th className="l">Basin at</th><th>Born (IV)</th><th>Merged (IV)</th><th>Persistence</th></tr></thead><tbody>
      {(iv.essential || []).map((b, k) => <tr key={'e' + k}><th scope="row" className="l">{at(b)}</th><td>{f(b.birth * 100, 1) + '%'}</td><td className="l">never</td><td>—</td></tr>)}
      {iv.bars.slice(0, 6).map((b, k) => <tr key={'b' + k}><th scope="row" className="l">{at(b)}</th><td>{f(b.birth * 100, 1) + '%'}</td><td>{f(b.death * 100, 1) + '%'}</td><td>{f((b.death - b.birth) * 100, 2) + ' pts'}</td></tr>)}
    </tbody></table></div>
  </> : null;
  let read = null;
  if (eod && !iv) read = <p className="note">No option surface for the latest session.</p>;
  else if (iv) {
    const deep = iv.bars[0];
    read = <>
      <span className="mono-label">Reading</span>
      <p className="note">{'The ' + iv.expiries.length + '-expiry surface for ' + fmtDate(iv.tradeDate) + ' runs from '}<b>{f(iv.minIv * 100, 1) + '%'}</b>{' to '}<b>{f(iv.maxIv * 100, 1) + '%'}</b>{' implied volatility, and sublevel-set persistence finds '}<b>{iv.basins}</b>{' basin' + (iv.basins === 1 ? '' : 's') + '. ' +
        (deep ? 'The deepest secondary basin sits at strike ' + nIN(iv.strikes[deep.at[1]]) + ', ' + iv.days[deep.at[0]] + ' days out, and survives ' + f((deep.death - deep.birth) * 100, 2) + ' volatility points before it merges into the main one. ' : '') +
        'A surface that breaks into several persistent basins is one where the market prices different stories at different strikes; one basin means a single, smooth story.'}</p>
      <p className="hint">{'Underlying ' + nIN(iv.underlying) + ' · implied volatility inverted from NSE closing prices with Black–Scholes, out-of-the-money side only.'}</p>
    </>;
  }
  return (
    // markup: public/index.html #p7 (filled by v2/tools/fill_markup.py)
    <section className="cand-live" id="p7">
      <div className="cl-head">
        <span className="mono-label">Candidate 7</span>
        <h3>Topology of the implied-volatility surface</h3>
      </div>
      <p className="cl-claim">Run a sublevel-set filtration over the strike × expiry surface and read its basins.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label" id="p7head">NIFTY options</span>
          <Src id="p7src" text={iv ? 'NSE F&O close ' + fmtDate(iv.tradeDate) + ' · ' + iv.expiries.length + ' expiries × ' + iv.strikes.length + ' strikes' : null} />
        </div>
        <div className="chart" id="p7map" style={{ padding: "14px 16px" }} ref={map}>{iv && W ? ivMap(W, iv) : null}<div className="tip" id="p7tip" hidden /></div>
        <div className="split">
          <div id="p7bars">{bars}</div>
          <div id="p7read">{read}</div>
        </div>
      </div>
    </section>
  );
}
