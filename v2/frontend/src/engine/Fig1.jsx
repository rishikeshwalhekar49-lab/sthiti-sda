// FIG. 1: Vietoris–Rips filtration on NSE sector correlations (original selectWindow,
// updateEps, drawComplex, drawBarcode, renderTimeline, renderBarsTable).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEngine, REG, cycleSectors } from '../state/EngineContext.jsx';
import { clamp, f, fmtDate, mean, niceTicks, svgX } from '../lib/format.js';
import { Src, Tip, useTip, useWidth } from '../components/common.jsx';
import { Details, Slider } from '../components/controls.jsx';

function readColors() {
  const cs = getComputedStyle(document.documentElement), c = {};
  ['ink', 'ink-2', 'muted', 'rule', 'surface', 'h0', 'h1', 'edge', 'tri'].forEach((n) => { c[n] = cs.getPropertyValue('--' + n).trim(); });
  return c;
}
function useColors() {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (!mq || !mq.addEventListener) return undefined;
    const on = () => setC(readColors());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return c;
}
function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = window.ResizeObserver ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', read);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', read); };
  }, [ref]);
  return box;
}
function fit(canvas, box) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), ctx = canvas.getContext('2d');
  canvas.width = Math.round(box.w * dpr); canvas.height = Math.round(box.h * dpr);
  canvas.style.width = box.w + 'px'; canvas.style.height = box.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawComplex(ctx, w, h, fig, EG, eps, hover, colors) {
  ctx.clearRect(0, 0, w, h);
  const xs = fig.pts.map((p) => p[0]), ys = fig.pts.map((p) => p[1]);
  const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, half = Math.max(maxx - minx, maxy - miny) / 2 * 1.35 || 1;
  const sc = Math.min(w, h) / (2 * half);
  const P = fig.pts.map((p) => [w / 2 + (p[0] - cx) * sc, h / 2 - (p[1] - cy) * sc]);
  ctx.beginPath();
  for (let k = 0; k < fig.ph.T.length; k++) {
    const tr = fig.ph.T[k];
    if (fig.ph.E[tr.col[2]].d > eps) break;
    let a = P[tr.v[0]], b = P[tr.v[1]], c = P[tr.v[2]];
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) { const t = b; b = c; c = t; }
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
  }
  ctx.fillStyle = colors.tri; ctx.fill('nonzero');
  ctx.beginPath();
  for (let k = 0; k < fig.ph.E.length; k++) { const e = fig.ph.E[k]; if (e.d > eps) break; ctx.moveTo(P[e.i][0], P[e.i][1]); ctx.lineTo(P[e.j][0], P[e.j][1]); }
  ctx.strokeStyle = colors.edge; ctx.lineWidth = 1; ctx.stroke();
  const hl = hover || (fig.main && eps >= fig.main.b && eps < fig.main.d ? fig.main : null);
  if (hl && hl.dim === 1) {
    ctx.beginPath();
    hl.cycle.forEach((ei) => { const ee = fig.ph.E[ei]; ctx.moveTo(P[ee.i][0], P[ee.i][1]); ctx.lineTo(P[ee.j][0], P[ee.j][1]); });
    ctx.setLineDash(eps < hl.b || eps >= hl.d ? [4, 4] : []);
    ctx.strokeStyle = colors.h1; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]);
  } else if (hl && hl.dim === 0 && hl.edge !== undefined) {
    const he = fig.ph.E[hl.edge];
    ctx.beginPath(); ctx.moveTo(P[he.i][0], P[he.i][1]); ctx.lineTo(P[he.j][0], P[he.j][1]);
    ctx.strokeStyle = colors.h0; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
  }
  P.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = colors.surface; ctx.stroke(); ctx.fillStyle = colors.ink; ctx.fill(); });
  ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = colors.muted; ctx.textBaseline = 'middle';
  const gx = mean(P.map((p) => p[0])), gy = mean(P.map((p) => p[1]));
  P.forEach((p, i) => {
    const dx = p[0] - gx, dy = p[1] - gy, L = Math.hypot(dx, dy) || 1, off = 14;
    ctx.textAlign = dx / L > 0.3 ? 'left' : dx / L < -0.3 ? 'right' : 'center';
    ctx.fillText(EG.codes[i], p[0] + dx / L * off, p[1] + dy / L * off);
  });
}

function roundBar(ctx, x0, x1, y, th) { const r = Math.min(th / 2, (x1 - x0) / 2); ctx.beginPath(); ctx.moveTo(x0 + r, y - th / 2); ctx.lineTo(x1 - r, y - th / 2); ctx.arc(x1 - r, y, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x0 + r, y + th / 2); ctx.arc(x0 + r, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); }

function drawBarcode(ctx, w, h, fig, eps, hover, colors) {
  ctx.clearRect(0, 0, w, h);
  const padL = 14, padR = 22, padT = 38, padB = 40, gapMid = 30, XMAX = Math.ceil(fig.maxD * 10) / 10;
  const X = (v) => padL + (Math.min(v, XMAX) / XMAX) * (w - padL - padR);
  const nRows = fig.h0Rows.length + 6, pitch = Math.max(4.5, (h - padT - padB - gapMid) / nRows);
  const th = Math.max(2.5, Math.min(5, pitch * 0.6));
  ctx.font = '400 10px "DM Mono", ui-monospace, monospace'; ctx.textBaseline = 'alphabetic';
  const ticks = niceTicks(0, XMAX, 4);
  ticks.forEach((v, i) => {
    const x = X(v), last = i === ticks.length - 1;
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 0.5, padT - 8); ctx.lineTo(x + 0.5, h - padB + 4); ctx.stroke();
    ctx.fillStyle = colors.muted; ctx.textAlign = i === 0 ? 'left' : last ? 'right' : 'center';
    ctx.fillText(v.toFixed(1), i === 0 ? x - 2 : last ? x + 4 : x, h - padB + 17);
  });
  ctx.textAlign = 'center'; ctx.fillText('ε  (correlation distance)', X(XMAX / 2), h - 6);
  const rows = [];
  const label = (yb, col, txt) => { ctx.fillStyle = col; ctx.fillRect(padL, yb - 6, 10, 4); ctx.fillStyle = colors['ink-2']; ctx.textAlign = 'left'; ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillText(txt, padL + 16, yb); };
  label(padT - 10, colors.h0, 'H₀  sector groups');
  let y = padT + pitch / 2;
  fig.h0Rows.forEach((b) => {
    ctx.globalAlpha = b.d > eps ? 1 : 0.32; ctx.fillStyle = colors.h0;
    const x1 = b.d === Infinity ? X(XMAX) - 6 : X(b.d);
    roundBar(ctx, X(0), Math.max(X(0) + th, x1), y, hover === b ? th + 2 : th);
    if (b.d === Infinity) { ctx.beginPath(); ctx.moveTo(X(XMAX) - 6, y - 4); ctx.lineTo(X(XMAX) + 1, y); ctx.lineTo(X(XMAX) - 6, y + 4); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; rows.push({ y, bar: b }); y += pitch;
  });
  const yEnd = y - pitch / 2;
  label(yEnd + gapMid - 10, colors.h1, 'H₁  loops');
  y = yEnd + gapMid + pitch / 2;
  if (!fig.h1Rows.length) { ctx.fillStyle = colors.muted; ctx.font = '400 11px "DM Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText('no loops in this window', padL, y + 3); }
  fig.h1Rows.forEach((b) => {
    ctx.globalAlpha = b.b <= eps && eps < b.d ? 1 : 0.32; ctx.fillStyle = colors.h1;
    roundBar(ctx, X(b.b), Math.max(X(b.b) + th, X(b.d)), y, hover === b ? th + 2 : th);
    ctx.globalAlpha = 1; rows.push({ y, bar: b }); y += pitch;
  });
  const ex = Math.round(X(eps)) + 0.5;
  ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, 16); ctx.lineTo(ex, h - padB + 4); ctx.stroke();
  ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = colors.ink;
  const lab = 'ε ' + f(eps, 2), lw = ctx.measureText(lab).width, right = ex + 6 + lw < w - 4;
  ctx.textAlign = right ? 'left' : 'right'; ctx.fillText(lab, right ? ex + 5 : ex - 5, 12);
  return { rows, pitch };
}

function tipFor(b, fig, EG) {
  if (b.dim === 0) {
    if (b.d === Infinity) return <><b>H₀ · the whole market</b><br />One component that never dies.</>;
    const e = fig.ph.E[b.edge];
    return <><b>H₀ · two groups merge</b><br />at ε {f(b.d, 2)} (ρ {f(1 - b.d * b.d / 2, 2)})<br />via {EG.codes[e.i]}–{EG.codes[e.j]}</>;
  }
  return <><b>H₁ · loop</b><br />opens at ε {f(b.b, 2)}, fills at {f(b.d, 2)}<br />persistence {f(b.d - b.b, 2)}<br />through {cycleSectors(b, fig, EG).join(', ')}</>;
}

function Timeline() {
  const { EG, fig, selectWindow, stopPlay, regimeOf } = useEngine();
  const host = useRef(null), W = useWidth(host), t = useTip(host);
  let svg = null;
  if (W && EG && fig) {
    const H = 120, L = 40, Rr = 12, T = 18, B = 26, n = EG.series.length;
    const rhos = EG.series.map((s) => s.rho);
    const lo = Math.min.apply(null, rhos) - 0.02, hi = Math.max.apply(null, rhos) + 0.02;
    const X = (i) => L + i / (n - 1) * (W - L - Rr), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const labels = [];
    let lastLab = -99;
    EG.series.forEach((s, i) => {
      if (i === 0 || s.date.slice(5, 7) === EG.series[i - 1].date.slice(5, 7)) return;
      if (X(i) - lastLab < 52) return;
      lastLab = X(i);
      labels.push(<text key={i} x={X(i)} y={H - 8} textAnchor="middle">{fmtDate(s.date).split(' ')[1]}</text>);
    });
    const mv = (ev) => {
      const i = clamp(Math.round((svgX(ev.currentTarget.ownerSVGElement, W, ev) - L) / (W - L - Rr) * (n - 1)), 0, n - 1), s = EG.series[i];
      t.show(<><b>{fmtDate(s.date)}</b><br />mean ρ {f(s.rho, 2)}<br />{REG[regimeOf(s.rho)].name}</>, ev);
      if (ev.buttons === 1 || ev.type === 'pointerdown') { stopPlay(); selectWindow(i, false); }
    };
    svg = (
      <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Mean sector correlation over the last year">
        <rect className="tl-calm" x={L} y={Y(EG.p33)} width={W - L - Rr} height={Math.max(0, H - B - Y(EG.p33))} />
        <rect className="tl-stress" x={L} y={T} width={W - L - Rr} height={Math.max(0, Y(EG.p67) - T)} />
        <rect className="tl-trans" x={L} y={Y(EG.p67)} width={W - L - Rr} height={Math.max(0, Y(EG.p33) - Y(EG.p67))} />
        {niceTicks(lo, hi, 3).map((tk) => (tk < lo || tk > hi ? null : <text key={tk} x={L - 6} y={Y(tk) + 3} textAnchor="end">{f(tk, 2)}</text>))}
        <path className="tl-line" d={'M' + EG.series.map((s, i) => X(i).toFixed(1) + ' ' + Y(s.rho).toFixed(1)).join(' L')} />
        <line className="tl-cursor" x1={X(fig.idx)} x2={X(fig.idx)} y1={T} y2={H - B} />
        {labels}
        <text x={L} y="10">Mean sector correlation · 60-day windows · calm / transitional / stress thirds</text>
        <rect className="hit" x={L} y={T} width={W - L - Rr} height={H - T - B} onPointerMove={mv} onPointerDown={mv} onPointerLeave={t.hide} />
      </svg>
    );
  }
  return <div className="chart" id="timeline" ref={host}>{svg}<Tip id="tlTip" t={t} /></div>;
}

export default function Fig1() {
  const { EG, fig, eps, epsRaw, epsMax, setEpsRaw, selectWindow, togglePlay, stopPlay, playing, regimeOf } = useEngine();
  const plots = useRef(null), cxWrap = useRef(null), bcWrap = useRef(null), cxC = useRef(null), bcC = useRef(null);
  const cxBox = useBox(cxWrap), bcBox = useBox(bcWrap);
  const colors = useColors();
  const [hover, setHover] = useState(null);
  const t = useTip(plots);
  const layout = useRef({ rows: [], pitch: 8 });

  useLayoutEffect(() => {
    if (!fig || !EG) return;
    if (cxBox.w && cxBox.h) drawComplex(fit(cxC.current, cxBox), cxBox.w, cxBox.h, fig, EG, eps, hover, colors);
    if (bcBox.w && bcBox.h) layout.current = drawBarcode(fit(bcC.current, bcBox), bcBox.w, bcBox.h, fig, eps, hover, colors);
  }, [fig, EG, eps, hover, colors, cxBox, bcBox]);
  useEffect(() => { setHover(null); t.hide(); }, [fig]);   // eslint-disable-line react-hooks/exhaustive-deps

  const figMove = (ev) => {
    const rect = bcC.current.getBoundingClientRect(), py = ev.clientY - rect.top;
    let best = null, bd = Infinity;
    layout.current.rows.forEach((r) => { const dd = Math.abs(r.y - py); if (dd < bd) { bd = dd; best = r; } });
    if (!best || bd > Math.max(5, layout.current.pitch / 2 + 1)) { if (hover) { setHover(null); t.hide(); } return; }
    if (hover !== best.bar) setHover(best.bar);
    t.show(tipFor(best.bar, fig, EG), ev);
  };

  let texts = null;
  if (EG && fig) {
    const s = EG.series[fig.idx], key = regimeOf(fig.rho), R = REG[key];
    const band = key === 'calm' ? 'lowest' : key === 'stress' ? 'highest' : 'middle';
    const rho = 1 - eps * eps / 2;
    let attrib;
    if (!fig.main) attrib = 'No loop in this window: the correlation structure has no hole at any radius.';
    else {
      const secs = cycleSectors(fig.main, fig, EG), outside = EG.codes.filter((c) => secs.indexOf(c) < 0);
      if (eps < fig.main.b) attrib = 'The widest loop opens at ε ' + f(fig.main.b, 2) + '. Drag ε right to see it.';
      else if (eps >= fig.main.d) attrib = 'The widest loop, through ' + secs.join(' → ') + ', filled in at ε ' + f(fig.main.d, 2) + '.';
      else attrib = <>Loop alive at this ε runs through <strong>{secs.join(' → ')}</strong>{outside.length ? '. ' + outside.join(', ') + ' sit outside it.' : '.'}</>;
    }
    texts = {
      src: EG.label + ' · ' + EG.nSectors + ' indices', winOut: fmtDate(s.date), first: fmtDate(EG.series[0].date), last: fmtDate(EG.series[EG.series.length - 1].date),
      epsOut: f(eps, 2), rhoOut: 'links sectors with ρ ≥ ' + (rho < 0 ? '−' : '') + Math.abs(rho).toFixed(2),
      b0: fig.h0Rows.filter((b) => b.d > eps).length, b1: fig.h1Rows.filter((b) => b.b <= eps && eps < b.d).length,
      l1: fig.ph.h1.reduce((a, b) => a + (b.d - b.b) * (b.d - b.b) / 4, 0).toFixed(3), mrho: f(fig.rho, 2), attrib,
      regime: <><strong>{R.name}</strong> — mean sector correlation {f(fig.rho, 2)}, in the {band} third of {EG.live ? 'the last two years' : 'the last two years, so this window is judged against today’s market'}. Sthiti would surface {R.surf}. <a href={R.href}>{R.tool} →</a></>,
    };
  }
  const bars = EG && fig ? <>
    <thead><tr><th>Bar</th><th>Born ε</th><th>Dies ε</th><th>Persistence</th><th>Detail</th></tr></thead>
    <tbody>
      {fig.h1Rows.map((b, i) => <tr key={'h1' + i}><td>H₁ loop</td><td>{f(b.b, 2)}</td><td>{f(b.d, 2)}</td><td>{f(b.d - b.b, 2)}</td><td>{cycleSectors(b, fig, EG).join(', ')}</td></tr>)}
      {fig.h0Rows.map((b, i) => {
        if (b.d !== Infinity && b.d < 0.25) return null;
        const det = b.d === Infinity ? 'whole market' : EG.codes[fig.ph.E[b.edge].i] + '–' + EG.codes[fig.ph.E[b.edge].j] + ' link';
        return <tr key={'h0' + i}><td>H₀ component</td><td>0.00</td><td>{b.d === Infinity ? '∞' : f(b.d, 2)}</td><td>{b.d === Infinity ? '∞' : f(b.d, 2)}</td><td>{det}</td></tr>;
      })}
    </tbody>
  </> : null;
  const winMax = EG ? EG.series.length - 1 : 100;
  return (
    // markup: public/index.html #fig1 (filled by v2/tools/fill_markup.py)
    <>
      <figure className="fig" id="fig1">
        <div className="fig-head mono-label">
          <span><b>FIG. 1</b> · Vietoris–Rips filtration on NSE sector correlations</span>
          <Src id="figSrc" text={texts && texts.src} live={!!EG && EG.live} />
        </div>
        <div className="plots" id="plots" ref={plots}><div className="cx-wrap" id="cxWrap" ref={cxWrap}><canvas id="cx" ref={cxC} role="img" aria-label="Sector indices placed by correlation distance, linked at the current filtration radius" /></div><div className="bc-wrap" id="bcWrap" ref={bcWrap}><canvas id="bc" ref={bcC} role="img" aria-label="Persistence barcode: H0 component bars and H1 loop bars against epsilon" onPointerMove={figMove} onPointerDown={figMove} onPointerLeave={() => { setHover(null); t.hide(); }} /></div><Tip id="tip" t={t} /></div>
        <div className="controls">
          <div className="ctl">
            <label htmlFor="win">
              <span>60-day window ending</span>
              <output id="winOut">{texts ? texts.winOut : '—'}</output>
            </label>
            <Slider id="win" min={0} max={winMax} step={1} value={fig ? fig.idx : 100} onInput={(v) => { stopPlay(); selectWindow(v, false); }} bubble={texts ? texts.winOut : ''} />
            <div className="ends" aria-hidden="true">
              <span id="winFirst">{texts && texts.first}</span>
              <span id="winLast">{texts && texts.last}</span>
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="eps">
              <span>Filtration ε</span>
              <output id="epsOut">{texts ? texts.epsOut : '—'}</output>
            </label>
            <Slider id="eps" min={0} max={epsMax} step={1} value={epsRaw} onInput={(v) => { stopPlay(); setEpsRaw(v); }} bubble={texts ? texts.epsOut : ''} />
            <div className="ends" aria-hidden="true">
              <span id="rhoOut">{texts && texts.rhoOut}</span>
            </div>
          </div>
          <button type="button" className="play" id="play" aria-pressed={String(playing)} onClick={togglePlay}>{playing ? 'Pause' : 'Play year'}</button>
        </div>
        <div className="readouts">
          <div>
            <div className="ro-k">Components β₀</div>
            <div className="ro-v" id="b0">{texts ? texts.b0 : '—'}</div>
          </div>
          <div>
            <div className="ro-k">Loops β₁</div>
            <div className="ro-v" id="b1">{texts ? texts.b1 : '—'}</div>
          </div>
          <div>
            <div className="ro-k">H₁ landscape L¹</div>
            <div className="ro-v" id="l1">{texts ? texts.l1 : '—'}</div>
          </div>
          <div>
            <div className="ro-k">Mean sector ρ</div>
            <div className="ro-v" id="mrho">{texts ? texts.mrho : '—'}</div>
          </div>
        </div>
        <div className="attrib">
          <span className="mono-label">Attribution · cand. 2</span>
          <span id="attrib">{texts ? texts.attrib : '—'}</span>
        </div>
        <div className="attrib">
          <span className="mono-label">Regime · this window</span>
          <span id="figRegime">{texts ? texts.regime : '—'}</span>
        </div>
        <figcaption><b>FIG. 1</b> Sector indices linked when their correlation distance is under ε, with triangles where three are mutually linked. Bars record when groups merge (H₀) and when loops open and close (H₁). Hover a bar to see what it is.</figcaption>
        <div className="tl" id="tlWrap">
          <Timeline />
        </div>
        <Details>
          <summary>Show the bars as a table</summary>
          <div className="tbl-wrap">
            <table className="bars-tbl" id="barsTbl">{bars}</table>
          </div>
        </Details>
      </figure>
    </>
  );
}
