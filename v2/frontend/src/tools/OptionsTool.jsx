// Visual option strategy simulator (original computeOptions, renderPayoff, renderOI).
import { useRef, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { clamp, f, inr, nIN, niceTicks, sInr, sNum, shortInr, svgX } from '../lib/format.js';
import { bs } from '../lib/quant.js';
import { Src, Tip, useTip, useWidth } from '../components/common.jsx';
import { Dropdown, Slider } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

const STRATS = {
  lc: { legs: (a) => [{ s: 1, t: 'C', i: a }], view: <><b>Bullish.</b> Buy the right to buy at the strike. The most you can lose is the premium; the upside is open-ended.</> },
  lp: { legs: (a) => [{ s: 1, t: 'P', i: a }], view: <><b>Bearish.</b> Buy the right to sell at the strike. The most you can lose is the premium; profit grows as the index falls.</> },
  bcs: { legs: (a, w) => [{ s: 1, t: 'C', i: a }, { s: -1, t: 'C', i: a + w }], view: <><b>Moderately bullish.</b> Buy a call and sell a higher one. The sold call cuts your cost but caps your profit.</> },
  bps: { legs: (a, w) => [{ s: 1, t: 'P', i: a }, { s: -1, t: 'P', i: a - w }], view: <><b>Moderately bearish.</b> Buy a put and sell a lower one. Cheaper than a plain put, with capped profit.</> },
  ls: { legs: (a) => [{ s: 1, t: 'C', i: a }, { s: 1, t: 'P', i: a }], view: <><b>Expecting a big move either way.</b> Buy a call and a put at the same strike. The move has to beat both premiums.</> },
  ic: { legs: (a, w) => [{ s: 1, t: 'P', i: a - 2 * w }, { s: -1, t: 'P', i: a - w }, { s: -1, t: 'C', i: a + w }, { s: 1, t: 'C', i: a + 2 * w }], view: <><b>Range-bound.</b> Sell a call spread and a put spread around the index. You keep the credit if it stays between the short strikes; the long wings cap the loss.</> },
};
const STRAT_OPTIONS = [['lc', 'Long call'], ['lp', 'Long put'], ['bcs', 'Bull call spread'], ['bps', 'Bear put spread'], ['ls', 'Long straddle'], ['ic', 'Iron condor']].map(([value, label]) => ({ value, label }));

function expiryDays(opt) {
  if (!opt || !opt.expiry) return 0;
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const p = String(opt.expiry).split('-');
  const exp = Date.UTC(+p[2], M[p[1]], +p[0], 10, 0);
  return Math.max(0, (exp - (Date.now() + 5.5 * 3600e3 - 5.5 * 3600e3)) / 864e5);
}

function compute(opt, st, w, lots) {
  const chain = opt.strikes.filter((r) => r.ce && r.pe);
  const und = opt.und, lot = opt.lot || 1;
  let atm = 0, best = Infinity;
  chain.forEach((r, i) => { const dd = Math.abs(r.K - und); if (dd < best) { best = dd; atm = i; } });
  const ivAtm = (chain[atm].ce.iv || chain[atm].pe.iv || 12) / 100;
  const days = expiryDays(opt), T = days / 365;
  const legs = STRATS[st].legs(atm, w).map((l) => {
    const row = chain[clamp(l.i, 0, chain.length - 1)];
    const leg = l.t === 'C' ? row.ce : row.pe;
    const iv = (leg.iv || ivAtm * 100) / 100;
    const prem = leg.ltp > 0 ? leg.ltp : bs(l.t, und, row.K, T, iv);
    return { s: l.s, t: l.t, K: row.K, prem, iv, modelled: !(leg.ltp > 0), oi: leg.oi };
  });
  const qty = lot * lots;
  const exp = (x) => legs.reduce((a, l) => a + l.s * (Math.max(0, l.t === 'C' ? x - l.K : l.K - x) - l.prem), 0) * qty;
  const now = (x) => legs.reduce((a, l) => a + l.s * (bs(l.t, x, l.K, T, l.iv) - l.prem), 0) * qty;
  const net = legs.reduce((a, l) => a + l.s * l.prem, 0) * qty;
  let mx = -Infinity, mn = Infinity, prev = null;
  const bes = [];
  for (let i = 0; i <= 3000; i++) { const x = und * 3 * i / 3000, p = exp(x); if (p > mx) mx = p; if (p < mn) mn = p; if (prev && ((prev.p < 0 && p >= 0) || (prev.p >= 0 && p < 0))) bes.push(prev.x + (0 - prev.p) * (x - prev.x) / (p - prev.p)); prev = { x, p }; }
  const netCalls = legs.reduce((a, l) => a + (l.t === 'C' ? l.s : 0), 0);
  return { und, lot, legs, exp, now, qty, net, mx, mn, bes, netCalls, days };
}

function Payoff({ OP }) {
  const host = useRef(null), W = useWidth(host), t = useTip(host);
  const [px, setPx] = useState(null);
  let svg = null;
  if (W && OP) {
    const H = Math.round(clamp(W * 0.5, 220, 320)), L = 58, Rr = 14, T = 22, B = 36, und = OP.und, lo = und * 0.94, hi = und * 1.06, n = 220;
    const xs = [], ye = [], yt = [];
    for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n; xs.push(x); ye.push(OP.exp(x)); yt.push(OP.now(x)); }
    let mn = Math.min(0, Math.min.apply(null, ye), Math.min.apply(null, yt)), mx = Math.max(0, Math.max.apply(null, ye), Math.max.apply(null, yt));
    const pad = (mx - mn) * 0.1 || 1000; mn -= pad; mx += pad;
    const X = (v) => L + (v - lo) / (hi - lo) * (W - L - Rr), Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B), y0 = Y(0);
    const curve = xs.map((x, k) => X(x).toFixed(1) + ' ' + Y(ye[k]).toFixed(1)).join(' L');
    const area = 'M' + X(xs[0]) + ' ' + y0 + ' L' + curve + ' L' + X(xs[n]) + ' ' + y0 + ' Z';
    const sx = X(und);
    const bes = [];
    for (let i = 1; i <= n; i++) {
      if ((ye[i - 1] < 0 && ye[i] >= 0) || (ye[i - 1] >= 0 && ye[i] < 0)) {
        const bx = xs[i - 1] + (0 - ye[i - 1]) * (xs[i] - xs[i - 1]) / (ye[i] - ye[i - 1]), bpx = X(bx);
        bes.push(<circle key={'bc' + i} className="p-be" cx={bpx} cy={y0} r="4" />, <text key={'bt' + i} className="t-strong" x={clamp(bpx, L + 30, W - Rr - 30)} y={y0 + (ye[i] >= 0 ? 16 : -9)} textAnchor="middle">BE {nIN(bx)}</text>);
      }
    }
    const hover = px != null ? { x: X(px), y: Y(OP.exp(px)) } : null;
    const mv = (ev) => {
      const x = clamp(lo + (svgX(ev.currentTarget.ownerSVGElement, W, ev) - L) / (W - L - Rr) * (hi - lo), lo, hi);
      setPx(x);
      t.show(<><b>NIFTY at {nIN(x)}</b><br />At expiry {sInr(OP.exp(x))}<br />If closed today {sInr(OP.now(x))}</>, ev);
    };
    svg = (
      <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Payoff diagram">
        <defs>
          <clipPath id="pcu"><rect x={L} y={T} width={W - L - Rr} height={Math.max(0, y0 - T)} /></clipPath>
          <clipPath id="pcd"><rect x={L} y={y0} width={W - L - Rr} height={Math.max(0, H - B - y0)} /></clipPath>
        </defs>
        {niceTicks(mn, mx, 5).map((tk) => { const y = Y(tk); return [<line key={'g' + tk} className="c-grid" x1={L} x2={W - Rr} y1={y} y2={y} />, <text key={'t' + tk} x={L - 8} y={y + 3} textAnchor="end">{tk === 0 ? '₹0' : shortInr(tk)}</text>]; })}
        {niceTicks(lo, hi, W < 520 ? 3 : 5).map((tk) => <text key={'x' + tk} x={X(tk)} y={H - 12} textAnchor="middle">{nIN(tk)}</text>)}
        <path className="p-up" clipPath="url(#pcu)" d={area} />
        <path className="p-dn" clipPath="url(#pcd)" d={area} />
        <line className="p-zero" x1={L} x2={W - Rr} y1={y0} y2={y0} />
        <line className="p-spot" x1={sx} x2={sx} y1={T} y2={H - B} />
        <text className="t-ink" x={sx} y={T - 8} textAnchor="middle">NIFTY {nIN(und)}</text>
        <path className="p-t0" d={'M' + xs.map((x, k) => X(x).toFixed(1) + ' ' + Y(yt[k]).toFixed(1)).join(' L')} />
        <path className="p-exp" d={'M' + curve} />
        {bes}
        <line className="c-cross" id="payX" x1={hover ? hover.x : 0} x2={hover ? hover.x : 0} y1={T} y2={H - B} visibility={hover ? 'visible' : 'hidden'} />
        <circle className="c-dot" id="payD" r="3.5" cx={hover ? hover.x : undefined} cy={hover ? hover.y : undefined} visibility={hover ? 'visible' : 'hidden'} />
        <rect className="hit" x={L} y={T} width={W - L - Rr} height={H - B - T} onPointerMove={mv} onPointerDown={mv} onPointerLeave={() => { setPx(null); t.hide(); }} />
      </svg>
    );
  }
  return <div className="chart" id="payoff" ref={host}>{svg}<Tip id="payTip" t={t} /></div>;
}

function oiFacts(opt) {
  const und = opt.und;
  let rows = opt.strikes.filter((r) => r.ce && r.pe && Math.abs(r.K - und) <= und * 0.05 && (r.ce.oi || r.pe.oi));
  if (rows.length < 3) rows = opt.strikes.filter((r) => r.ce && r.pe).slice(0, 25);
  const all = opt.strikes.filter((r) => r.ce && r.pe);
  const pain = all.map((x) => all.reduce((a, r) => a + (r.ce.oi || 0) * Math.max(0, x.K - r.K) + (r.pe.oi || 0) * Math.max(0, r.K - x.K), 0));
  const mp = all[pain.indexOf(Math.min.apply(null, pain))];
  const sumC = all.reduce((a, r) => a + (r.ce.oi || 0), 0), sumP = all.reduce((a, r) => a + (r.pe.oi || 0), 0);
  const kc = all.reduce((a, r) => ((r.ce.oi || 0) > (a.ce.oi || 0) ? r : a)), kp = all.reduce((a, r) => ((r.pe.oi || 0) > (a.pe.oi || 0) ? r : a));
  return { rows, mp, sumC, sumP, kc, kp };
}

function OIChart({ opt }) {
  const host = useRef(null), W = useWidth(host), t = useTip(host);
  let svg = null;
  if (W && opt && opt.strikes) {
    const { rows, mp } = oiFacts(opt);
    const H = 220, L = 44, Rr = 8, T = 26, B = 30, n = rows.length, band = (W - L - Rr) / n, bw = clamp(band * 0.33, 3, 14);
    const maxOi = Math.max.apply(null, rows.map((r) => Math.max(r.ce.oi || 0, r.pe.oi || 0))) || 1;
    const ticks = niceTicks(0, maxOi / 1000, 4), ymax = Math.max.apply(null, ticks) * 1000;
    const Y = (v) => T + (1 - v / ymax) * (H - T - B), bx = (i) => L + band * (i + 0.5);
    const every = Math.max(1, Math.ceil(52 / band));
    const mpi = rows.map((r) => r.K).indexOf(mp.K);
    const mv = (ev) => {
      const i = clamp(Math.floor((svgX(ev.currentTarget.ownerSVGElement, W, ev) - L) / band), 0, n - 1), r = rows[i];
      t.show(<><b>Strike {nIN(r.K)}</b><br />Call OI {nIN(r.ce.oi || 0)}{r.ce.chgOi ? ' (' + sNum(r.ce.chgOi) + ')' : ''}<br />Put OI {nIN(r.pe.oi || 0)}{r.pe.chgOi ? ' (' + sNum(r.pe.chgOi) + ')' : ''}<br />CE ₹{nIN(r.ce.ltp || 0, 2)} · PE ₹{nIN(r.pe.ltp || 0, 2)}</>, ev);
    };
    svg = (
      <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Open interest by strike">
        {ticks.map((tk) => { const y = Y(tk * 1000); return [<line key={'g' + tk} className="c-grid" x1={L} x2={W - Rr} y1={y} y2={y} />, <text key={'t' + tk} x={L - 6} y={y + 3} textAnchor="end">{nIN(tk)}k</text>]; })}
        {rows.map((r, i) => {
          const c = bx(i);
          return [
            <rect key={'c' + i} className="oi-c" x={c - bw - 1} y={Y(r.ce.oi || 0)} width={bw} height={Y(0) - Y(r.ce.oi || 0)} rx="1.5" />,
            <rect key={'p' + i} className="oi-p" x={c + 1} y={Y(r.pe.oi || 0)} width={bw} height={Y(0) - Y(r.pe.oi || 0)} rx="1.5" />,
            i % every === 0 ? <text key={'k' + i} x={c} y={H - 10} textAnchor="middle">{nIN(r.K)}</text> : null,
          ];
        })}
        {mpi >= 0 && <><line className="oi-mp" x1={bx(mpi)} x2={bx(mpi)} y1={T - 4} y2={Y(0)} /><text className="t-strong" x={clamp(bx(mpi), L + 40, W - Rr - 40)} y={T - 10} textAnchor="middle">Max pain {nIN(mp.K)}</text></>}
        <line className="c-grid" x1={L} x2={W - Rr} y1={Y(0)} y2={Y(0)} /><text x={L} y="10">Open interest (contracts)</text>
        <rect className="hit" x={L} y={T} width={W - L - Rr} height={H - T - B} onPointerMove={mv} onPointerDown={mv} onPointerLeave={t.hide} />
      </svg>
    );
  }
  return <div className="chart" id="oiChart" ref={host}>{svg}<Tip id="oiTip" t={t} /></div>;
}

export default function OptionsTool() {
  const { opt, optLoaded } = useData();
  const [st, setSt] = useState('bcs');
  const [w, setW] = useState(6);
  const [lots, setLots] = useState(1);
  const has = !!(opt && opt.strikes && opt.strikes.length);
  const OP = has ? compute(opt, st, w, lots) : null;
  const src = opt ? (opt.source === 'live' ? 'NSE option chain · ' + (opt.timestamp || 'live') : 'NSE F&O close · ' + (opt.timestamp || '')) : optLoaded ? 'option chain unavailable' : null;
  const oi = has ? oiFacts(opt) : null;
  let kv = null, legs = null, note = null;
  if (OP) {
    kv = <>
      <dt>{OP.net >= 0 ? 'You pay (debit)' : 'You receive (credit)'}</dt><dd>{inr(Math.abs(OP.net))}</dd>
      <dt>Max profit</dt><dd className="pos">{OP.netCalls > 0 ? 'Unlimited' : sInr(OP.mx)}</dd>
      <dt>Max loss</dt><dd className="neg">{OP.netCalls < 0 ? 'Unlimited' : (OP.mn < 0 ? '−' + inr(-OP.mn) : '₹0')}</dd>
      <dt>Breakeven{OP.bes.length > 1 ? 's' : ''}</dt><dd>{OP.bes.length ? OP.bes.map((b) => nIN(b)).join(' / ') : '—'}</dd>
    </>;
    legs = <>
      <thead><tr><th>Leg</th><th>Strike</th><th>IV</th><th>Premium</th></tr></thead>
      <tbody>{OP.legs.map((l, i) => <tr key={i}><td>{(l.s > 0 ? 'Buy' : 'Sell') + ' ' + (l.t === 'C' ? 'CE' : 'PE')}</td><td>{nIN(l.K)}</td><td>{f(l.iv * 100, 1)}%</td><td>₹{nIN(l.prem, 2)}{l.modelled ? '*' : ''}</td></tr>)}</tbody>
    </>;
    note = 'Premiums are traded prices from the NSE chain' + (OP.legs.some((l) => l.modelled) ? '; * marks an untraded strike priced with Black–Scholes at its own implied volatility' : '') + '. Position: ' + lots + ' lot' + (lots > 1 ? 's' : '') + ' × ' + OP.lot + ' = ' + nIN(OP.qty) + ' units. ' + f(OP.days, 1) + ' days to expiry.';
  } else if (optLoaded) {
    kv = <><dt>Option chain unavailable right now.</dt><dd /></>;
  }
  return (
    // markup: public/index.html #t-options+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-options" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Visual option strategy simulator</span>{" "}<span className="level-badge">Stage 3</span><h2>Turn the live option chain into a payoff graph</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-deriv">Derivatives</a>
          </dd>
          <dt>Statistics</dt>
          <dd>Option chain, implied volatility, OI, max pain</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> See what an option trade pays before you place it. <a href="#learn/l-a1" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">Legs are priced at the market: every premium is the traded price from NSE's NIFTY option chain, and the dashed curve uses each strike's own implied volatility. Nothing here is modelled except that curve.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label" id="optHead">{opt ? 'NIFTY options · expiry ' + opt.expiry : 'NIFTY options'}</span>
          <Src id="optSrc" text={src} live={!!opt && opt.source === 'live'} />
        </div>
        <div className="opt-controls">
          <div className="field">
            <label htmlFor="oStrat">Strategy</label>
            <Dropdown id="oStrat" variant="field" value={st} options={STRAT_OPTIONS} onChange={setSt} />
          </div>
          <div className="ctl">
            <label htmlFor="oWidth">
              <span>Strikes away</span>
              <output id="oWidtho">{w}</output>
            </label>
            <Slider id="oWidth" min={2} max={12} step={1} value={w} onInput={setW} bubble={String(w)} />
          </div>
          <div className="ctl">
            <label htmlFor="oLots">
              <span>Lots</span>
              <output id="oLotso">{lots}</output>
            </label>
            <Slider id="oLots" min={1} max={10} step={1} value={lots} onInput={setLots} bubble={String(lots)} />
          </div>
          <div className="field">
            <label>Expiry</label>
            <div className="hint" id="oExpiry">{OP ? opt.expiry + ' (' + f(OP.days, 1) + ' days)' : '—'}</div>
          </div>
          <div className="field">
            <label>Lot size</label>
            <div className="hint" id="oLotSize">{OP ? OP.lot + ' per lot' : '—'}</div>
          </div>
        </div>
        <div className="strat-view" id="oView">{OP ? STRATS[st].view : null}</div>
        <div className="opt-main">
          <div className="opt-chart">
            <div className="legend-row">
              <span className="lg"><i className="exp" />P&amp;L at expiry</span>
              <span className="lg"><i className="t0" />P&amp;L today</span>
            </div>
            <Payoff OP={OP} />
          </div>
          <div className="opt-side" aria-live="polite">
            <dl className="kv" id="oKV" style={{ marginTop: "0" }}>{kv}</dl>
            <table className="legs" id="oLegs">{legs}</table>
            <p className="hint" id="oNote">{note}</p>
          </div>
        </div>
        <div className="oi">
          <div className="oi-head">
            <h3>Open interest by strike</h3>
            <div className="legend-row">
              <span className="lg"><i className="call" />Call OI (CE)</span>
              <span className="lg"><i className="put" />Put OI (PE)</span>
            </div>
          </div>
          <OIChart opt={has ? opt : null} />
          <p className="oi-read" id="oiRead">{oi ? <>Max pain is <b>{nIN(oi.mp.K)}</b>: if the index expired there, option buyers as a group would lose the most. The put-call ratio on open interest is <b>{f(oi.sumP / (oi.sumC || 1), 2)}</b>. The biggest call OI sits at <b>{nIN(oi.kc.K)}</b> and the biggest put OI at <b>{nIN(oi.kp.K)}</b>; many courses read those as resistance and support. Treat all three as context, not a forecast.</> : null}</p>
        </div>
      </div>
    </Reveal>
  );
}
