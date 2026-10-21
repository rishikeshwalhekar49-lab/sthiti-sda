// Interactive chart annotations (original renderRSIChart), as a React SVG with a hover tip.
import { useRef, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { clamp, fmtDate, nIN, niceTicks, svgX } from '../lib/format.js';
import { rsiSeries, sma } from '../lib/quant.js';
import { Src, Tip, useTip, useWidth } from '../components/common.jsx';
import { Dropdown } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

function RsiChart({ sym }) {
  const d = useData();
  const host = useRef(null);
  const W = useWidth(host);
  const t = useTip(host);
  const [k, setK] = useState(null);
  let svg = null;
  if (W && d.eod && sym) {
    const ser = d.seriesLive(sym);
    const N = Math.min(120, ser.c.length), off = ser.c.length - N;
    const rsiAll = rsiSeries(ser.c), smaAll = ser.c.map((_, i) => sma(ser.c, 50, i));
    const vis = ser.c.slice(off), rv = rsiAll.slice(off), smv = smaAll.slice(off), dts = ser.d.slice(off);
    const left = 6, right = 70, top = 12, H1 = Math.round(clamp(W * 0.34, 170, 250)), gap = 30, H2 = 92, bottom = 26, H = top + H1 + gap + H2 + bottom;
    const pw = W - left - right, step = pw / (N - 1), half = step / 2, xs = (i) => left + i * step;
    const all = vis.concat(smv.filter((v) => v != null));
    let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    const pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    const yP = (v) => top + (1 - (v - lo) / (hi - lo)) * H1, r0 = top + H1 + gap, yR = (v) => r0 + (1 - v / 100) * H2;
    const yLast = yP(vis[N - 1]);
    const els = [];
    niceTicks(lo, hi, 4).forEach((tk) => {
      if (tk < lo || tk > hi) return;
      const y = yP(tk);
      els.push(<line key={'g' + tk} className="c-grid" x1={left} x2={W - right} y1={y} y2={y} />);
      if (Math.abs(y - yLast) > 13) els.push(<text key={'gt' + tk} x={W - right + 8} y={y + 3}>{nIN(tk)}</text>);
    });
    let i = 0;
    while (i < N) {
      const cls = rv[i] > 70 ? 'z-ob' : rv[i] < 30 ? 'z-os' : null;
      if (!cls) { i++; continue; }
      let j = i;
      while (j + 1 < N && (cls === 'z-ob' ? rv[j + 1] > 70 : rv[j + 1] < 30)) j++;
      const x0 = Math.max(left, xs(i) - half), x1 = Math.min(W - right, xs(j) + half);
      els.push(<rect key={'za' + i} className={cls} x={x0} y={top} width={x1 - x0} height={H1} />, <rect key={'zb' + i} className={cls} x={x0} y={r0} width={x1 - x0} height={H2} />);
      i = j + 1;
    }
    [70, 30].forEach((v) => { els.push(<line key={'b' + v} className="c-band" x1={left} x2={W - right} y1={yR(v)} y2={yR(v)} />, <text key={'bt' + v} x={W - right + 8} y={yR(v) + 3}>{v}</text>); });
    els.push(<line key="rb" className="c-grid" x1={left} x2={W - right} y1={r0 + H2} y2={r0 + H2} />, <text key="rl" x={left} y={r0 - 8}>RSI (14)</text>);
    const path = (arr, yf) => { let p = ''; arr.forEach((v, n) => { if (v == null) return; p += (p ? 'L' : 'M') + xs(n).toFixed(1) + ' ' + yf(v).toFixed(1); }); return p; };
    els.push(<path key="sma" className="c-sma" d={path(smv, yP)} />, <path key="cl" className="c-close" d={path(vis, yP)} />, <path key="rsi" className="c-rsi" d={path(rv, yR)} />);
    let lastOb = -1, lastOs = -1;
    for (i = 0; i < N; i++) {
      const prev = rsiAll[off + i - 1];
      if (rv[i] > 70 && prev <= 70) { els.push(<circle key={'mo' + i} className="m-ob" cx={xs(i)} cy={yP(vis[i])} r="4.5" />); lastOb = i; }
      if (rv[i] < 30 && prev >= 30) { els.push(<circle key={'ms' + i} className="m-os" cx={xs(i)} cy={yP(vis[i])} r="4.5" />); lastOs = i; }
    }
    if (lastOb >= 0) els.push(<text key="lob" className="t-strong" x={clamp(xs(lastOb), left + 30, W - right - 30)} y={yP(vis[lastOb]) - 11} textAnchor="middle">RSI &gt; 70</text>);
    if (lastOs >= 0) els.push(<text key="los" className="t-strong" x={clamp(xs(lastOs), left + 30, W - right - 30)} y={yP(vis[lastOs]) + 19} textAnchor="middle">RSI &lt; 30</text>);
    els.push(<circle key="dot" className="c-dot" cx={xs(N - 1)} cy={yLast} r="3.5" />, <text key="lp" className="t-strong" x={W - right + 8} y={yLast + 4}>₹{nIN(vis[N - 1], 2)}</text>);
    els.push(<text key="lr" className="t-strong" x={W - right + 8} y={yR(rv[N - 1]) + 4}>{Math.round(rv[N - 1])}</text>);
    let lastLab = -99;
    for (i = 1; i < N; i++) { if (dts[i].slice(5, 7) !== dts[i - 1].slice(5, 7) && xs(i) - lastLab > 44 && xs(i) < W - right - 10) { els.push(<text key={'m' + i} x={xs(i)} y={H - 8} textAnchor="middle">{fmtDate(dts[i]).split(' ')[1]}</text>); lastLab = xs(i); } }
    const on = k != null;
    const kx = on ? xs(k) : 0;
    els.push(<line key="cx" className="c-cross" id="rsiX" x1={kx} x2={kx} y1={top} y2={r0 + H2} visibility={on ? 'visible' : 'hidden'} />,
      <circle key="d1" className="c-dot" id="rsiD1" r="3.5" cx={on ? kx : undefined} cy={on ? yP(vis[k]) : undefined} visibility={on ? 'visible' : 'hidden'} />,
      <circle key="d2" className="c-dot" id="rsiD2" r="3.5" cx={on ? kx : undefined} cy={on ? yR(rv[k]) : undefined} visibility={on ? 'visible' : 'hidden'} />);
    const mv = (ev) => {
      const kk = clamp(Math.round((svgX(ev.currentTarget.ownerSVGElement, W, ev) - left) / step), 0, N - 1), r = Math.round(rv[kk]);
      setK(kk);
      t.show(<><b>{fmtDate(dts[kk])}</b><br />Close ₹{nIN(vis[kk], 2)}{smv[kk] ? <><br />50-day MA ₹{nIN(smv[kk], 2)}</> : null}<br />RSI {r}{r > 70 ? ' · overbought' : r < 30 ? ' · oversold' : ''}</>, ev);
    };
    els.push(<rect key="hit" className="hit" x={left} y={top} width={pw} height={r0 + H2 - top} onPointerMove={mv} onPointerDown={mv} onPointerLeave={() => { setK(null); t.hide(); }} />);
    svg = <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label={sym + ' daily closes with 50-day moving average and RSI'}>{els}</svg>;
  }
  return <div className="chart" id="rsiChart" ref={host}>{svg}<Tip id="rsiTip" t={t} /></div>;
}

export default function ChartTool() {
  const d = useData();
  const syms = d.symbols();
  const [pick, setPick] = useState(null);
  const sym = pick || syms[0] || null;
  const s = sym ? d.stk(sym) : null, open = d.marketOpen();
  const options = syms.map((x) => ({ value: x, label: x + ' · ' + d.stk(x).name }));
  return (
    // markup: public/index.html #t-chart+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-chart" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Interactive chart annotations · Quizzes on real data</span>{" "}<span className="level-badge">Stage 2</span><h2>See RSI thresholds on the chart, then get quizzed on them</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-tech">Technical analysis</a>
          </dd>
          <dt>Statistics</dt>
          <dd>RSI (14), 50-day moving average</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> Read a price chart, its trend line and its momentum. <a href="#learn/l-m2" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">After the RSI lesson, the chart marks every day this stock crossed the overbought or oversold line. Hover any day to read its close, its 50-day average and its RSI.</p>
      <div className="panel">
        <div className="panel-bar">
          <div className="pick">
            <label className="mono-label" htmlFor="chartStock">Stock</label>
            <Dropdown id="chartStock" variant="pick" value={sym} options={options} onChange={setPick} />
          </div>
          <Src id="chartSrc" text={s ? 'NSE closes to ' + fmtDate(s.dates[s.dates.length - 1]) + (open ? ' + live price' : '') : null} live={s && open} />
        </div>
        <div className="chart-wrap">
          <div className="legend-row">
            <span className="lg"><i />Close</span>
            <span className="lg"><i className="sma" />50-day MA</span>
            <span className="lg"><i className="rsi" />RSI (14)</span>
            <span className="lg"><i className="zob" />RSI above 70</span>
            <span className="lg"><i className="zos" />RSI below 30</span>
          </div>
          <RsiChart sym={sym} />
        </div>
      </div>
    </Reveal>
  );
}
