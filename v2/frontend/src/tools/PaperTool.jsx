// Paper trading and post-trade diagnostics (original renderPaper, renderLog, renderDiag).
import { useEffect, useRef, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, inr, mean, nIN, sInr, sPct, timeIST } from '../lib/format.js';
import { Pill, Src } from '../components/common.jsx';
import { Dropdown } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

const LS = 'sthiti.paper.v1';
const FRESH = { cash: 1000000, pos: null, log: [] };
function loadPaper() {
  try { const saved = JSON.parse(localStorage.getItem(LS) || 'null'); if (saved && saved.log) return { ...FRESH, ...saved }; } catch (_) { /* private mode */ }
  return FRESH;
}
const LBL = { pass: '✓ OK', watch: '! Watch', flag: '✕ Fix' };

function Diagnostics({ log }) {
  const T = log.slice().reverse();
  const wins = T.filter((t) => t.pnl > 0), losses = T.filter((t) => t.pnl < 0);
  const net = T.reduce((a, t) => a + t.pnl, 0);
  const sum = <><span>Trades <b>{T.length}</b></span>{T.length ? <><span>Win rate <b>{Math.round(wins.length / T.length * 100)}%</b></span><span>Net P&amp;L <b className={net >= 0 ? 'pos' : 'neg'}>{sInr(net, 0)}</b></span></> : null}</>;
  let items;
  if (T.length < 3 || !wins.length || !losses.length) {
    items = <li><p>Diagnostics read your own trade log — nothing is pre-filled. Close at least three trades, including one winner and one loser, and the habits show up here: how long you hold losers against winners, whether your average win covers your average loss, and whether you size up after a loss.</p><p className="wide-note">You have {T.length} closed trade{T.length === 1 ? '' : 's'} ({wins.length} winning, {losses.length} losing).</p></li>;
  } else {
    const avgW = mean(wins.map((t) => t.pnl)), avgL = mean(losses.map((t) => -t.pnl));
    const holdW = mean(wins.map((t) => t.mins)), holdL = mean(losses.map((t) => t.mins));
    const after = [], other = [];
    T.forEach((t, i) => { (i > 0 && T[i - 1].pnl < 0 ? after : other).push(t.qty * t.entry); });
    const hr = holdW ? holdL / holdW : 0, pr = avgL ? avgW / avgL : 0, rv = mean(other) ? mean(after) / mean(other) : 0;
    const fmtMins = (m) => (m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' hr');
    const list = [
      { t: 'Holding losers too long', st: hr > 1.5 ? 'flag' : hr > 1.2 ? 'watch' : 'pass', p: 'You held losing trades for ' + fmtMins(holdL) + ' on average and winners for ' + fmtMins(holdW) + ' (' + f(hr, 1) + '×). ' + (hr > 1.2 ? 'Waiting for a loser to come back while banking winners quickly is the disposition effect.' : 'Losers aren’t lingering much longer than winners.'), href: '#learn/p-psych', m: 'Module: loss aversion and exit rules' },
      { t: 'Cutting profits early', st: pr < 0.8 ? 'flag' : pr < 1.2 ? 'watch' : 'pass', p: 'Your average win is ' + inr(avgW) + ' and your average loss ' + inr(avgL) + ', a payoff ratio of ' + f(pr, 2) + '. ' + (pr < 1 ? 'Each loss takes back more than a win gives.' : 'Winners are paying for losers.'), href: '#tools/t-position', m: 'Module: risk-to-reward and trailing stops' },
      { t: 'Sizing up after a loss', st: rv > 1.4 ? 'flag' : rv > 1.15 ? 'watch' : 'pass', p: after.length ? 'After a loss, your next position averaged ' + inr(mean(after)) + ' against ' + inr(mean(other)) + ' otherwise (' + f(rv, 1) + '×). ' + (rv > 1.15 ? 'Betting bigger to win it back is revenge trading.' : 'Your size stays steady after losses.') : 'No trade yet followed a loss.', href: '#learn/p-psych', m: 'Module: sticking to a trade plan' },
    ];
    items = list.map((it) => <li key={it.t}><div className="diag-top"><b>{it.t}</b><Pill st={it.st} label={LBL[it.st]} /></div><p>{it.p}</p><a href={it.href}>{it.m} →</a></li>);
  }
  return { sum, items };
}

export default function PaperTool() {
  const d = useData();
  const syms = d.symbols();
  const [pick, setPick] = useState(null);
  const sym = pick || syms[0] || null;
  const [PP, setPP] = useState(loadPaper);
  const [qty, setQty] = useState('25');
  const [msg, setMsg] = useState('Buy to open a position, sell to close it.');
  const hist = useRef([]);
  const p = sym && d.eod ? d.lastPrice(sym) : null;

  const save = (next) => { try { localStorage.setItem(LS, JSON.stringify({ cash: next.cash, pos: next.pos, log: next.log })); } catch (_) { /* private mode */ } setPP(next); };
  useEffect(() => {          // this session's ticks, as the original kept them
    if (!sym || !p) return;
    const last = hist.current[hist.current.length - 1];
    if (!last || last[0] !== sym || last[1] !== p) hist.current.push([sym, p]);
    if (hist.current.length > 80) hist.current.shift();
  }, [sym, p]);

  const buy = () => {
    const q = Math.floor(+qty || 0);
    if (!p) return;
    if (q < 1) return setMsg('Enter a quantity of 1 or more.');
    if (PP.pos && PP.pos.sym !== sym) return setMsg('Close your ' + PP.pos.sym + ' position first: this demo holds one stock at a time.');
    const cost = q * p;
    if (cost > PP.cash) return setMsg('Not enough virtual cash for ' + nIN(q) + ' shares (' + inr(cost) + ').');
    const pos = PP.pos ? { ...PP.pos } : { sym, qty: 0, avg: 0, at: Date.now() };
    pos.avg = (pos.avg * pos.qty + cost) / (pos.qty + q);
    pos.qty += q;
    save({ ...PP, pos, cash: PP.cash - cost });
    setMsg('Bought ' + nIN(q) + ' ' + sym + ' at ₹' + nIN(p, 2) + '.');
  };
  const sell = () => {
    if (!PP.pos || PP.pos.sym !== sym || PP.pos.qty === 0) return setMsg('You have no ' + sym + ' shares to sell. This demo is long-only.');
    const q = Math.min(Math.floor(+qty || 0), PP.pos.qty);
    if (q < 1) return setMsg('Enter a quantity of 1 or more.');
    const pnl = (p - PP.pos.avg) * q;
    const log = [{ sym, qty: q, entry: PP.pos.avg, exit: p, pnl, mins: (Date.now() - PP.pos.at) / 60000, at: Date.now() }].concat(PP.log);
    const left = PP.pos.qty - q;
    save({ cash: PP.cash + q * p, pos: left === 0 ? null : { ...PP.pos, qty: left }, log });
    setMsg('Sold ' + nIN(q) + ' ' + sym + ' at ₹' + nIN(p, 2) + ' for ' + sInr(pnl, 2) + '. Diagnostics updated.');
  };
  const clear = () => { hist.current = []; save({ ...FRESH }); setMsg('Log cleared.'); };

  let spark = null, chg = null;
  const pos = PP.pos && PP.pos.sym === sym ? PP.pos : null;
  if (p) {
    const pct = d.dayPct(sym);
    chg = { text: sPct(pct) + (d.marketOpen() ? ' today' : ' at the close'), cls: pct >= 0 ? 'pos' : 'neg' };
    const ticks = hist.current.filter((x) => x[0] === sym).map((x) => x[1]);
    const h = d.stk(sym).c.slice(-60).concat(ticks.slice(1));
    let mn = Math.min.apply(null, h), mx = Math.max.apply(null, h);
    if (pos) { mn = Math.min(mn, pos.avg); mx = Math.max(mx, pos.avg); }
    const pad = (mx - mn) * 0.1 || 1, y = (v) => 68 - (v - (mn - pad)) / ((mx + pad) - (mn - pad)) * 64;
    spark = <><polyline className="s-line" points={h.map((v, i) => (i / Math.max(1, h.length - 1) * 300).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')} />{pos && <line className="s-avg" x1="0" x2="300" y1={y(pos.avg)} y2={y(pos.avg)} />}</>;
  }
  const u = pos && p ? (p - pos.avg) * pos.qty : 0;
  const realised = PP.log.reduce((a, t) => a + t.pnl, 0);
  const q = sym ? d.qt(sym) : null;
  const rows = PP.log.slice(0, 10);
  const logTable = rows.length
    ? <><thead><tr><th scope="col" className="l">Stock</th><th scope="col">Qty</th><th scope="col">Entry</th><th scope="col">Exit</th><th scope="col">Held</th><th scope="col">P&amp;L</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td className="l">{r.sym}</td><td>{r.qty}</td><td>₹{nIN(r.entry, 2)}</td><td>₹{nIN(r.exit, 2)}</td><td>{r.mins < 60 ? Math.max(1, Math.round(r.mins)) + 'm' : (r.mins / 60).toFixed(1) + 'h'}</td><td className={r.pnl >= 0 ? 'pos' : 'neg'}>{sInr(r.pnl, 0)}</td></tr>)}</tbody></>
    : <tbody><tr><td className="l" style={{ color: 'var(--muted)' }}>No closed trades yet. Buy, wait, then sell.</td></tr></tbody>;
  const diag = d.eod ? Diagnostics({ log: PP.log }) : null;
  const options = syms.map((x) => ({ value: x, label: x + ' · ' + d.stk(x).name }));
  const open = d.marketOpen();
  return (
    // markup: public/index.html #t-paper+decorate (filled by v2/tools/fill_markup.py)
    <>
      <Reveal className="tool" id="t-paper" as="section" stagger={0.08}>
        <div className="tool-head">
          <div><span className="mono-label">Paper trading · Post-trade diagnostics</span>{" "}<span className="level-badge">Stage 2</span><h2>Practise with virtual money, then see your habits</h2></div>
          <dl className="tool-meta">
            <dt>Pillar</dt>
            <dd>
              <a href="#learn/p-psych">Trading psychology</a>
            </dd>
            <dt>Statistics</dt>
            <dd>Live price, your trade log</dd>
          </dl>
        </div>
        <p className="tool-plain"><b>In plain words:</b> Practise with virtual money, then read your own habits. <a href="#learn/l-m4" className="practise">Read the lesson first →</a></p>
        <p className="tool-intro">Trades fill at the live price from BSE. Your log stays in this browser, and the diagnostics on the right read it as soon as you have closed a few trades.</p>
        <div className="panel">
          <div className="panel-bar">
            <span className="mono-label">Virtual account · ₹10,00,000</span>
            <Src id="paperSrc" text={p ? (open ? 'BSE live · ' + (q ? timeIST(q.quoteAt) : '') : 'Market closed · fills at the last traded price') : null} live={!!p && open} />
          </div>
          <div className="paper">
            <div className="paper-left">
              <div className="pick">
                <label className="mono-label" htmlFor="paperStock">Stock</label>
                <Dropdown id="paperStock" variant="pick" value={sym} options={options} onChange={setPick} />
              </div>
              <div className="tick">
                <b id="ppPrice">{p ? '₹' + nIN(p, 2) : '—'}</b>
                <span id="ppChg" className={chg ? chg.cls : undefined}>{chg ? chg.text : null}</span>
              </div>
              <svg className="spark-live" id="ppSpark" viewBox="0 0 300 72" preserveAspectRatio="none" aria-hidden="true">{spark}</svg>
              <div className="trade-row">
                <div className="field">
                  <label htmlFor="ppQty">Quantity</label>
                  <input type="number" id="ppQty" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
                </div>
                <button type="button" className="btn btn-buy btn-sm" id="ppBuy" onClick={buy}>Buy</button>
                <button type="button" className="btn btn-sell btn-sm" id="ppSell" onClick={sell}>Sell</button>
                <button type="button" className="chipbtn" id="ppClear" onClick={clear}>Clear log</button>
              </div>
              <p className="paper-msg" id="ppMsg" aria-live="polite">{msg}</p>
              <dl className="paper-stats">
                <div>
                  <dt>Position</dt>
                  <dd id="ppPos">{p ? (pos ? nIN(pos.qty) + ' @ ₹' + nIN(pos.avg, 2) : (PP.pos ? 'in ' + PP.pos.sym : '0 shares')) : '0 shares'}</dd>
                </div>
                <div>
                  <dt>Unrealised P&amp;L</dt>
                  <dd id="ppU" className={u > 0 ? 'pos' : u < 0 ? 'neg' : undefined}>{p ? sInr(u, 2) : '₹0'}</dd>
                </div>
                <div>
                  <dt>Virtual cash</dt>
                  <dd id="ppCash">{p ? inr(PP.cash, 0) : '₹10,00,000'}</dd>
                </div>
                <div>
                  <dt>Realised</dt>
                  <dd id="ppR" className={realised > 0 ? 'pos' : realised < 0 ? 'neg' : undefined}>{p ? sInr(realised, 2) : '₹0'}</dd>
                </div>
              </dl>
              <div className="log">
                <span className="mono-label">Your closed trades</span>
                <div className="tbl-scroll">
                  <table className="data-tbl" id="ppLog">{d.eod ? logTable : null}</table>
                </div>
              </div>
            </div>
            <div className="paper-right">
              <span className="mono-label">Post-trade diagnostics</span>
              <div className="diag-sum" id="dgSum">{diag && diag.sum}</div>
              <ul className="diag" id="dgList">{diag && diag.items}</ul>
            </div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
