// Smart stop-loss and position calculator (original loadPosStock / renderPos).
import { useEffect, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, inr, nIN, shortInr } from '../lib/format.js';
import { Src } from '../components/common.jsx';
import { Dropdown, Slider } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

function Ladder({ entry, stop, target, rps, rr, gain, loss }) {
  const lo = stop - 0.35 * rps, hi = target + 0.35 * rps, y = (v) => 14 + (1 - (v - lo) / (hi - lo)) * 192, ax = 44, x2 = 168;
  const rows = [['l-target', target, 'Target', '+' + f(rr, 1) + 'R'], ['l-entry', entry, 'Entry', '0'], ['l-stop', stop, 'Stop', '−1R']];
  return (
    <svg viewBox="0 0 300 220" role="img" aria-label="Trade plan">
      <line className="l-axis" x1={ax} x2={ax} y1="8" y2="212" />
      <rect className="l-reward" x={ax} y={y(target)} width={x2 - ax} height={y(entry) - y(target)} />
      <rect className="l-risk" x={ax} y={y(entry)} width={x2 - ax} height={y(stop) - y(entry)} />
      {rows.map((r) => [
        <line key={r[0]} className={r[0]} x1={ax} x2={x2} y1={y(r[1])} y2={y(r[1])} />,
        <text key={r[0] + 't'} x={x2 + 8} y={y(r[1]) + 4}><tspan style={{ fill: 'var(--ink)' }}>{r[2]}</tspan> ₹{nIN(r[1], 2)}</text>,
        <text key={r[0] + 'r'} x={ax - 6} y={y(r[1]) + 4} textAnchor="end">{r[3]}</text>,
      ])}
      {y(entry) - y(target) > 22 && <text x={(ax + x2) / 2} y={(y(entry) + y(target)) / 2 + 4} textAnchor="middle">Reward {shortInr(gain)}</text>}
      {y(stop) - y(entry) > 22 && <text x={(ax + x2) / 2} y={(y(entry) + y(stop)) / 2 + 4} textAnchor="middle">Risk {shortInr(loss)}</text>}
    </svg>
  );
}

export default function PositionTool() {
  const d = useData();
  const { eod } = d;
  const syms = d.symbols();
  const [pick, setPick] = useState(null);
  const sym = pick || syms[0] || null;
  const [cap, setCap] = useState('500000');
  const [risk, setRisk] = useState(1);
  const [entryS, setEntryS] = useState('0');
  const [atrS, setAtrS] = useState('0');
  const [mult, setMult] = useState(2);
  const [rrv, setRR] = useState(2);
  const [src, setSrc] = useState(null);

  useEffect(() => {          // loadPosStock: when the data arrives, and when the stock changes
    if (!eod || !sym) return;
    const s = d.stk(sym);
    if (!s) return;
    setEntryS((d.lastPrice(sym) || s.c[s.c.length - 1]).toFixed(2));
    setAtrS(s.atr.toFixed(2));
    setSrc({ text: sym + ' · entry ' + (d.marketOpen() ? 'live BSE price' : 'last close') + ' · ATR from NSE daily data', live: d.marketOpen() });
  }, [eod, sym]);   // eslint-disable-line react-hooks/exhaustive-deps

  const capN = +cap || 0, rp = risk, entry = +entryS || 0, atr = +atrS || 0, m = mult, rr = rrv;
  let shares = '—', kv = null, note = { cls: 'note', text: '' }, ladder = null;
  if (eod) {
    if (capN <= 0 || entry <= 0 || atr <= 0) note = { cls: 'note', text: 'Enter your capital, an entry price and the ATR to size the trade.' };
    else {
      const budget = capN * rp / 100, rps = m * atr, stop = entry - rps, target = entry + rr * rps;
      if (stop <= 0) note = { cls: 'note warn', text: 'The stop would fall below zero. Use a smaller ATR multiple.' };
      else {
        const byRisk = Math.floor(budget / rps), byCap = Math.floor(capN / entry), n = Math.min(byRisk, byCap), capLimited = byCap < byRisk;
        const value = n * entry, pct = capN ? value / capN * 100 : 0, loss = n * rps, gain = n * rr * rps, sh2 = Math.min(Math.floor(budget / (2 * rps)), byCap);
        shares = <>{nIN(n)}<small>shares</small></>;
        kv = <>
          <dt>Risk budget ({f(rp, 2)}% of capital)</dt><dd>{inr(budget)}</dd>
          <dt>Stop-loss</dt><dd className="neg">₹{nIN(stop, 2)} (−{f(rps / entry * 100, 1)}%)</dd>
          <dt>Target ({f(rr, 1)}R)</dt><dd className="pos">₹{nIN(target, 2)} (+{f(rr * rps / entry * 100, 1)}%)</dd>
          <dt>Position value</dt><dd>{inr(value)} ({f(pct, 1)}%)</dd>
          <dt>Loss if stopped out</dt><dd className="neg">−{inr(loss)}</dd>
          <dt>Gain at target</dt><dd className="pos">+{inr(gain)}</dd>
        </>;
        let msg = '', cls = 'note';
        if (n === 0) { cls = 'note warn'; msg = 'Your risk budget of ' + inr(budget) + ' is smaller than the risk on one share (₹' + nIN(rps, 2) + '). Skip this trade or risk more per trade.'; }
        else if (capLimited) msg = 'Your capital, not your risk budget, limits this trade: you can only afford ' + nIN(byCap) + ' shares. ';
        else if (pct > 25) { cls = 'note warn'; msg = 'This puts ' + f(pct, 0) + '% of your capital in one stock. The portfolio lesson suggests spreading it out. '; }
        if (n > 0) msg += 'If ATR doubled to ₹' + nIN(atr * 2, 2) + ', the same ' + inr(budget) + ' of risk would buy only ' + nIN(sh2) + ' shares. That’s how live volatility changes your size.';
        note = { cls, text: msg };
        ladder = <Ladder entry={entry} stop={stop} target={target} rps={rps} rr={rr} gain={gain} loss={loss} />;
      }
    }
  }
  const options = syms.map((x) => ({ value: x, label: x + ' · ' + d.stk(x).name }));
  return (
    // markup: public/index.html #t-position+decorate (filled by v2/tools/fill_markup.py)
    <>
      <Reveal className="tool" id="t-position" as="section" stagger={0.08}>
        <div className="tool-head">
          <div><span className="mono-label">Smart stop-loss &amp; position calculator</span>{" "}<span className="level-badge">Stage 2</span><h2>Size the trade from your capital and the stock's volatility</h2></div>
          <dl className="tool-meta">
            <dt>Pillar</dt>
            <dd>
              <a href="#learn/p-risk">Risk management</a>
            </dd>
            <dt>Statistics</dt>
            <dd>ATR (14), beta</dd>
          </dl>
        </div>
        <p className="tool-plain"><b>In plain words:</b> Work out how many shares to buy before you buy them. <a href="#learn/l-m3" className="practise">Read the lesson first →</a></p>
        <p className="tool-intro">Entry price and ATR come from live data. The stop sits a multiple of ATR below entry, so a jumpier stock gets a wider stop and a smaller position.</p>
        <div className="panel">
          <div className="panel-bar">
            <span className="mono-label">Live entry price and ATR</span>
            <Src id="posSrc" text={src && src.text} live={src && src.live} />
          </div>
          <div className="posc">
            <div className="posc-form">
              <div className="field">
                <label htmlFor="pStock">Stock</label>
                <Dropdown id="pStock" variant="field" value={sym} options={options} onChange={setPick} />
              </div>
              <div className="field">
                <label htmlFor="pCap">Total capital (₹)</label>
                <input type="number" id="pCap" min="1000" step="1000" value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" />
              </div>
              <div className="ctl">
                <label htmlFor="pRisk">
                  <span>Risk per trade</span>
                  <output id="pRisko">{f(risk, 2) + '%'}</output>
                </label>
                <Slider id="pRisk" min={0.25} max={3} step={0.25} value={risk} onInput={setRisk} bubble={f(risk, 2) + '%'} />
              </div>
              <div className="field">
                <label htmlFor="pEntry">Entry price (₹)</label>
                <input type="number" id="pEntry" min="1" step="0.05" value={entryS} onChange={(e) => setEntryS(e.target.value)} inputMode="decimal" />
              </div>
              <div className="field">
                <label htmlFor="pATR">ATR, 14-day (₹)</label>
                <input type="number" id="pATR" min="0.05" step="0.05" value={atrS} onChange={(e) => setAtrS(e.target.value)} inputMode="decimal" />
              </div>
              <div className="ctl">
                <label htmlFor="pMult">
                  <span>Stop distance</span>
                  <output id="pMulto">{f(mult, 1) + ' × ATR'}</output>
                </label>
                <Slider id="pMult" min={1} max={4} step={0.5} value={mult} onInput={setMult} bubble={f(mult, 1) + ' × ATR'} />
              </div>
              <div className="ctl">
                <label htmlFor="pRR">
                  <span>Target</span>
                  <output id="pRRo">{f(rrv, 1) + ' R'}</output>
                </label>
                <Slider id="pRR" min={1} max={4} step={0.5} value={rrv} onInput={setRR} bubble={f(rrv, 1) + ' R'} />
              </div>
            </div>
            <div className="posc-out" aria-live="polite">
              <span className="mono-label">Position size</span>
              <div className="big-num" id="pShares">{shares}</div>
              <dl className="kv" id="pKV">{kv}</dl>
              <p className={note.cls} id="pNote">{note.text}</p>
            </div>
            <div className="posc-ladder">
              <span className="mono-label">Trade plan</span>
              <div id="pLadder">{ladder}</div>
            </div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
