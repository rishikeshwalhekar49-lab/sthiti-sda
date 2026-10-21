// Learn-as-you-screen and the stock health scorecard (original renderScreener, lessonFor,
// checksFor, peWhy, renderLesson, renderScore).
import { useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, fmtDate, list, nIN, sPct, timeIST } from '../lib/format.js';
import { Pill, Src } from '../components/common.jsx';
import Reveal from '../motion/Reveal.jsx';

function columns(d) {
  return [
    { k: 'price', h: 'Price', f: (s) => { const p = d.lastPrice(s.sym), c = d.dayPct(s.sym); return p == null ? '—' : <>₹{nIN(p, 2)} <span className={c >= 0 ? 'pos' : 'neg'}>{sPct(c)}</span></>; } },
    { k: 'pe', h: 'P/E', f: (s) => { const v = d.fund(s.sym, 'pe'); return v ? f(v.value, 1) : '—'; } },
    { k: 'sectorPe', h: 'Sector P/E', f: (s) => { const v = d.sectorPE(s.sym); return v ? f(v, 1) : '—'; } },
    { k: 'roe', h: 'ROE', f: (s) => { const v = d.fund(s.sym, 'roe'); return v ? f(v.value, 1) + '%' : '—'; } },
    { k: 'eps', h: 'EPS', f: (s) => { const v = d.fund(s.sym, 'eps'); return v ? '₹' + nIN(v.value, 2) : '—'; } },
    { k: 'mcap', h: 'Market cap', f: (s) => { const q = d.qt(s.sym); const v = q && q.fundamentals && q.fundamentals.mcapCr; return v ? '₹' + nIN(v / 1e5, 2) + ' L cr' : '—'; } },
    { k: 'beta', h: 'Beta (1y)', f: (s) => (s.beta ? f(s.beta, 2) : '—') },
    { k: 'rsi', h: 'RSI (14)', f: (s) => { const r = d.liveRsi(s.sym); return r == null ? '—' : String(Math.round(r)); } },
    { k: 'ma200', h: 'vs 200-DMA', f: (s) => { const p = d.lastPrice(s.sym); if (!p || !s.sma200) return '—'; const x = (p / s.sma200 - 1) * 100; return <span className={x >= 0 ? 'pos' : 'neg'}>{sPct(x, 1)}</span>; } },
  ];
}

function lessonFor(d, sym, k) {
  const s = d.stk(sym), q = d.qt(sym), n = s.name, F = { p: 'Fundamental analysis', h: '#learn/p-fund' };
  const price = d.lastPrice(sym), pe = d.fund(sym, 'pe'), spe = d.sectorPE(sym), roe = d.fund(sym, 'roe'), eps = d.fund(sym, 'eps');
  const fd = q && q.fundamentals, open = d.marketOpen();
  if (k === 'price') {
    const hi = fd && fd.high52, lo = fd && fd.low52;
    const pos = hi && lo ? (price - lo) / (hi - lo) * 100 : null;
    return { title: 'Price · ₹' + nIN(price, 2), body: '₹' + nIN(price, 2) + ' is ' + n + '’s last traded price' + (open ? ' right now' : ' at today’s close') + ', ' + sPct(d.dayPct(sym)) + ' on the day. ' + (pos != null ? 'Over the last year it has ranged from ₹' + nIN(lo, 2) + ' to ₹' + nIN(hi, 2) + ', so it sits ' + Math.round(pos) + '% up that range. ' : '') + 'Price on its own says nothing about value: a ₹3,000 share can be cheaper than a ₹300 one.', pillar: F.p, href: F.h };
  }
  if (k === 'pe') {
    if (!pe) return { title: 'P/E ratio', body: 'No P/E available for ' + n + ' from this feed right now.', pillar: F.p, href: F.h };
    const rel = spe ? pe.value / spe : null;
    return {
      title: 'P/E ratio · ' + f(pe.value, 1), pillar: F.p, href: F.h,
      body: n + ' trades at ' + f(pe.value, 1) + '× its ' + pe.basis + ' earnings: you pay ₹' + f(pe.value, 1) + ' for every ₹1 it earns in a year. ' +
        (spe ? 'The ' + s.sectorIndex + ' index trades at ' + f(spe, 1) + '×, so it is priced ' + (rel > 1.1 ? 'above' : rel < 0.9 ? 'below' : 'in line with') + ' its sector. ' : '') +
        (eps ? 'That comes from earnings per share of ₹' + nIN(eps.value, 2) + '.' : ''),
    };
  }
  if (k === 'sectorPe') return { title: 'Sector P/E · ' + (spe ? f(spe, 1) : '—'), body: 'NSE publishes a P/E for every index. ' + s.sectorIndex + ' is at ' + (spe ? f(spe, 1) : '—') + '×, which is the yardstick courses use before calling a single stock cheap or expensive. Sector medians move: a high P/E in a cheap sector is a different signal from a high P/E in an expensive one.', pillar: F.p, href: F.h };
  if (k === 'roe') return { title: 'Return on equity · ' + (roe ? f(roe.value, 1) + '%' : '—'), body: roe ? n + ' earned ₹' + f(roe.value / 100, 2) + ' last year for every ₹1 of shareholders’ money (' + roe.basis + '). Courses treat 15% or more as strong. ' + (roe.value >= 15 ? 'It clears that bar.' : roe.value >= 10 ? 'It falls a little short.' : 'It falls well short: the business isn’t turning its capital into much profit.') : 'No ROE from this feed.', pillar: F.p, href: F.h };
  if (k === 'eps') return { title: 'Earnings per share · ' + (eps ? '₹' + nIN(eps.value, 2) : '—'), body: eps ? 'Each share earned ₹' + nIN(eps.value, 2) + ' over the trailing twelve months (' + eps.basis + '). Multiply by the number of shares and you have the profit; divide the price by it and you have the P/E of ' + (pe ? f(pe.value, 1) : '—') + '.' : 'No EPS from this feed.', pillar: F.p, href: F.h };
  if (k === 'mcap') { const mc = fd && fd.mcapCr; return { title: 'Market capitalisation', body: mc ? 'At ₹' + nIN(mc, 0) + ' crore, the market values the whole company at that much. Market cap, not share price, tells you the size of the business, and it decides whether a stock is large, mid or small cap.' : 'No market cap from this feed.', pillar: F.p, href: F.h }; }
  if (k === 'beta') return { title: 'Beta · ' + (s.beta ? f(s.beta, 2) : '—'), body: s.beta ? 'Measured over the last year of daily moves against the NIFTY 50: when the index moved 1%, ' + n + ' moved about ' + f(s.beta, 2) + '%. ' + (s.beta > 1.2 ? 'More volatile than the market, so the risk lesson says to size positions smaller.' : s.beta < 0.8 ? 'Steadier than the market, which is why defensive investors like stocks like it.' : 'It moves roughly with the market.') + ' Beta is a tendency from past data, not a promise.' : 'Not enough history for a beta.', pillar: 'Risk management', href: '#learn/p-risk' };
  if (k === 'rsi') { const r = Math.round(d.liveRsi(sym)); return { title: 'RSI (14) · ' + r, body: (r > 70 ? 'RSI above 70 is the classic overbought line: gains have outpaced losses over the last 14 sessions. In a strong uptrend RSI can stay above 70 for weeks, so courses treat it as a warning, not a sell signal.' : r < 30 ? 'RSI below 30 is the classic oversold line: losses have outpaced gains over the last 14 sessions. Falling stocks can stay oversold, so courses wait for a turn before reading it as a bounce.' : 'RSI between 30 and 70 is neutral: neither buyers nor sellers have dominated the last 14 sessions.') + ' Computed from NSE closes' + (open ? ', with today’s live price as the last bar.' : '.'), pillar: 'Technical analysis', href: '#learn/p-tech' }; }
  const x = (price / s.sma200 - 1) * 100;
  return { title: 'Price vs 200-day MA · ' + sPct(x, 1), body: 'The 200-day moving average sits at ₹' + nIN(s.sma200, 2) + '. ' + (x >= 0 ? 'Price is above it, which most courses read as a long-term uptrend.' : 'Price is below it, which most courses read as a long-term downtrend.') + ' The 50-day average is at ₹' + nIN(s.sma50, 2) + '; the two crossing is the “golden cross” or “death cross” the scanner looks for.', pillar: 'Technical analysis', href: '#learn/p-tech' };
}

function checksFor(d, sym) {
  const s = d.stk(sym), pe = d.fund(sym, 'pe'), spe = d.sectorPE(sym), roe = d.fund(sym, 'roe'), q = d.qt(sym);
  const price = d.lastPrice(sym), rel = pe && spe ? pe.value / spe : null;
  const npm = q && q.fundamentals ? q.fundamentals.npm : null;
  return [
    { name: 'Valuation', val: pe ? 'P/E ' + f(pe.value, 1) + ' vs ' + (spe ? f(spe, 1) : '—') : '—', st: rel == null ? 'na' : rel <= 1 ? 'pass' : rel <= 1.3 ? 'watch' : 'flag', note: rel == null ? 'No sector P/E to compare with' : rel <= 1 ? 'At or below its sector index' : rel <= 1.3 ? 'Up to 30% above its sector index' : 'More than 30% above its sector index' },
    { name: 'Profitability', val: roe ? 'ROE ' + f(roe.value, 1) + '%' : '—', st: !roe ? 'na' : roe.value >= 15 ? 'pass' : roe.value >= 10 ? 'watch' : 'flag', note: !roe ? 'No ROE in this feed' : roe.value >= 15 ? 'Clears the 15% bar most courses use' : roe.value >= 10 ? 'Below the 15% bar' : 'Well below the 15% bar' },
    { name: 'Margins', val: npm ? 'Net margin ' + f(npm, 1) + '%' : '—', st: !npm ? 'na' : npm >= 15 ? 'pass' : npm >= 8 ? 'watch' : 'flag', note: !npm ? 'No margin in this feed' : npm >= 15 ? 'Keeps a healthy share of revenue as profit' : npm >= 8 ? 'Moderate margins' : 'Thin margins' },
    { name: 'Trend', val: price && s.sma200 ? sPct((price / s.sma200 - 1) * 100, 1) + ' vs 200-DMA' : '—', st: !price || !s.sma200 ? 'na' : price > s.sma200 ? 'pass' : 'flag', note: !price || !s.sma200 ? '' : price > s.sma200 ? 'Trading above its long-term average' : 'Trading below its long-term average' },
    { name: 'Volatility', val: s.beta ? 'Beta ' + f(s.beta, 2) : '—', st: !s.beta ? 'na' : s.beta <= 1 ? 'pass' : s.beta <= 1.3 ? 'watch' : 'flag', note: !s.beta ? '' : s.beta <= 1 ? 'Moves less than the index' : s.beta <= 1.3 ? 'Moves a little more than the index' : 'Swings harder than the index: size down' },
  ];
}

function peWhy(d, sym) {
  const s = d.stk(sym), pe = d.fund(sym, 'pe'), spe = d.sectorPE(sym), roe = d.fund(sym, 'roe'), q = d.qt(sym);
  if (!pe || !spe) return 'Without both a company P/E and a sector P/E there is nothing to compare.';
  const rel = pe.value / spe, npm = q && q.fundamentals ? q.fundamentals.npm : null, r = [];
  const price = d.lastPrice(sym);
  if (rel > 1.1) {
    if (roe && roe.value >= 20) r.push('a high ROE (' + f(roe.value, 0) + '%)');
    if (npm && npm >= 18) r.push('fat net margins (' + f(npm, 0) + '%)');
    if (s.beta && s.beta < 0.9) r.push('steadier-than-market earnings (beta ' + f(s.beta, 2) + ')');
    if (price && s.sma200 && price > s.sma200) r.push('a price above its 200-day average');
    return r.length ? 'Courses would point to ' + list(r) + ' as reasons investors pay up.' : 'None of the usual reasons (high ROE, fat margins, steady earnings) stand out, so the premium looks stretched.';
  }
  if (rel < 0.9) {
    if (roe && roe.value < 15) r.push('an ROE under 15%');
    if (npm && npm < 10) r.push('thin margins (' + f(npm, 0) + '%)');
    if (s.beta && s.beta > 1.1) r.push('above-market volatility (beta ' + f(s.beta, 2) + ')');
    if (price && s.sma200 && price < s.sma200) r.push('a price below its 200-day average');
    return r.length ? 'Courses would point to ' + list(r) + ' as reasons for the discount.' : 'Nothing in these numbers explains the discount, which is what value investors look for. Read the annual report before trusting it.';
  }
  return 'Its P/E is close to its sector index, so the market prices it like an average peer.';
}

export default function ScreenerTool() {
  const d = useData();
  const { eod } = d;
  const syms = d.symbols();
  const [pick, setPick] = useState({ sym: null, k: 'pe' });
  const sel = { sym: pick.sym || syms[0] || null, k: pick.k };
  const COLS = columns(d);
  const open = d.marketOpen();
  const q = sel.sym ? d.qt(sel.sym) : null;

  const table = eod ? <>
    <thead><tr><th scope="col">Stock</th><th scope="col" className="l">Sector</th>{COLS.map((c) => <th scope="col" key={c.k}>{c.h}</th>)}</tr></thead>
    <tbody>{syms.map((sym) => {
      const s = d.stk(sym);
      return (
        <tr key={sym} className={sym === sel.sym ? 'row-sel' : undefined}>
          <th scope="row"><b>{sym}</b><span>{s.name}</span></th><td className="l">{s.sector}</td>
          {COLS.map((c) => {
            const on = sym === sel.sym && c.k === sel.k;
            return <td className="cell" key={c.k}><button type="button" className="cellbtn" data-sym={sym} data-k={c.k} aria-pressed={String(on)} onClick={() => setPick({ sym, k: c.k })}><span>{c.f(s)}</span></button></td>;
          })}
        </tr>
      );
    })}</tbody>
  </> : null;

  let lesson = null, score = null;
  if (eod && sel.sym) {
    const L = lessonFor(d, sel.sym, sel.k);
    lesson = <><span className="mono-label">30-second lesson · {sel.sym}</span><h3>{L.title}</h3><p>{L.body}</p><a className="from" href={L.href}>From: {L.pillar} →</a></>;
    const s = d.stk(sel.sym), cs = checksFor(d, sel.sym), app = cs.filter((c) => c.st !== 'na');
    const pass = app.filter((c) => c.st === 'pass').length;
    const pe = d.fund(sel.sym, 'pe'), spe = d.sectorPE(sel.sym), rel = pe && spe ? pe.value / spe : null;
    score = <>
      <span className="mono-label">Stock health scorecard</span><h3>{sel.sym} · {s.name}</h3><p className="score-sum">{pass} of {app.length} checks pass · {s.sector}</p>
      <ul className="checks">{cs.map((c) => <li key={c.name}><span className="cn">{c.name}</span><span className="cv">{c.val}</span><Pill st={c.st} /><span className="cnote">{c.note}</span></li>)}</ul>
      <p className="pe-why"><b>Why is its P/E {rel == null ? 'where it is' : rel > 1.1 ? 'high' : rel < 0.9 ? 'low' : 'average'}?</b> {peWhy(d, sel.sym)}</p>
      <p className="wide-note">Debt-to-equity and profit growth aren’t in these public feeds; they need the company’s annual report or a paid fundamentals provider.</p>
    </>;
  }
  const src = eod ? (open ? 'BSE live quotes · ' : 'BSE last close · ') + (q ? timeIST(q.quoteAt) : '') + ' · fundamentals from BSE · history NSE ' + fmtDate(eod.asOf) : null;

  return (
    // markup: public/index.html #t-screen+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-screen" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Learn-as-you-screen · Stock health scorecard</span>{" "}<span className="level-badge">Stage 1</span><h2>Tap any number for a 30-second lesson</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-fund">Fundamental analysis</a>
          </dd>
          <dt>Statistics</dt>
          <dd>P/E, ROE, EPS, market cap, beta, RSI</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> What a company’s numbers mean, one tap at a time. <a href="#learn/l-b3" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">Beginners open a screener and see a P/E or a beta with no idea what it means. Here every number is a button: pick one to get a lesson about that stock, and a health scorecard for its company.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Ten NIFTY 50 stocks</span>
          <Src id="screenSrc" text={src} live={eod && open} />
        </div>
        <div className="tbl-scroll">
          <table className="data-tbl screener" id="screener">{table}</table>
        </div>
        <div className="split">
          <div className="lesson" id="lesson" aria-live="polite">{lesson}</div>
          <div className="scorecard" id="scorecard" aria-live="polite">{score}</div>
        </div>
      </div>
    </Reveal>
  );
}
