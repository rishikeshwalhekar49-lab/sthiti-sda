// Regime-conditioned backtester (original renderBacktest, renderBtChart).
import { useRef, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, fmtDate, list, mean, nIN, sPct } from '../lib/format.js';
import { Src, useWidth } from '../components/common.jsx';
import { Dropdown } from '../components/controls.jsx';
import { ChipToggle } from '../components/chips.jsx';
import Reveal from '../motion/Reveal.jsx';

const NAMES = { calm: 'Calm', trans: 'Transitional', stress: 'Stress' };
function btStats(trades) {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.ret > 0), rets = trades.map((t) => t.ret);
  return { n: trades.length, win: wins.length / trades.length * 100, avg: mean(rets), hold: mean(trades.map((t) => t.bars)), best: Math.max.apply(null, rets), worst: Math.min.apply(null, rets) };
}

function BtChart({ byReg, all, on }) {
  const host = useRef(null), W = useWidth(host);
  let svg = null;
  if (W && all) {
    const H = 230, L = 42, R = 12, T = 18, gap = 26, panel = (H - T - gap - 26) / 2;
    const groups = [{ k: 'all', label: 'All', st: all, cls: 'bar-all' }, { k: 'calm', label: 'Calm', st: byReg.calm, cls: 'bar-calm' }, { k: 'trans', label: 'Transitional', st: byReg.trans, cls: 'bar-trans' }, { k: 'stress', label: 'Stress', st: byReg.stress, cls: 'bar-stress' }];
    const bw = (W - L - R) / groups.length, barW = Math.min(46, bw * 0.5);
    const wMax = Math.max.apply(null, groups.map((g) => (g.st ? g.st.win : 0)).concat([50])) * 1.15;
    const yW = (v) => T + (1 - v / wMax) * panel;
    const base = T + panel + gap;
    const vals = groups.map((g) => (g.st ? g.st.avg : 0));
    const aMax = Math.max.apply(null, vals.concat([0.5])) * 1.25, aMin = Math.min.apply(null, vals.concat([0])) * 1.25;
    const yA = (v) => base + (1 - (v - aMin) / ((aMax - aMin) || 1)) * panel;
    const cls = (g) => g.cls + (g.k !== 'all' && !on[g.k] ? ' bar-off' : '');
    svg = (
      <svg viewBox={'0 0 ' + W + ' ' + H} width={W} height={H} role="img" aria-label="Win rate and average return by regime">
        <text x={L} y={T - 6}>Win rate %</text>
        {[0, 25, 50].concat(wMax > 62 ? [75] : []).map((t) => (t > wMax ? null : [<line key={'g' + t} className="c-grid" x1={L} x2={W - R} y1={yW(t)} y2={yW(t)} />, <text key={'t' + t} x={L - 6} y={yW(t) + 3} textAnchor="end">{t}</text>]))}
        {groups.map((g, i) => { if (!g.st) return null; const x = L + bw * i + (bw - barW) / 2; return [<rect key={'w' + i} className={cls(g)} x={x} y={yW(g.st.win)} width={barW} height={Math.max(1, yW(0) - yW(g.st.win))} rx="2" />, <text key={'wt' + i} className="t-strong" x={x + barW / 2} y={yW(g.st.win) - 5} textAnchor="middle">{f(g.st.win, 0)}%</text>]; })}
        <text x={L} y={base - 6}>Average return per trade %</text>
        <line className="p-zero" x1={L} x2={W - R} y1={yA(0)} y2={yA(0)} />
        {groups.map((g, i) => {
          if (!g.st) return null;
          const x = L + bw * i + (bw - barW) / 2, y0 = yA(0), y1 = yA(g.st.avg);
          return [<rect key={'a' + i} className={cls(g)} x={x} y={Math.min(y0, y1)} width={barW} height={Math.max(1, Math.abs(y1 - y0))} rx="2" />,
            <text key={'at' + i} className="t-strong" x={x + barW / 2} y={g.st.avg >= 0 ? Math.min(y0, y1) - 5 : Math.max(y0, y1) + 12} textAnchor="middle">{sPct(g.st.avg, 2)}</text>,
            <text key={'al' + i} x={x + barW / 2} y={H - 8} textAnchor="middle">{g.label}</text>];
        })}
      </svg>
    );
  }
  return <div className="chart" id="btChart" ref={host}>{svg}<div className="tip" id="btTip" hidden /></div>;
}

export default function BacktestTool() {
  const { eod } = useData();
  const keys = eod && eod.backtests ? Object.keys(eod.backtests) : [];
  const [pick, setPick] = useState(null);
  const key = pick || keys[0] || null;
  const [on, setOn] = useState({ calm: true, trans: true, stress: true });
  const toggle = (r) => setOn((o) => ({ ...o, [r]: !o[r] }));
  const bt = key && eod ? eod.backtests[key] : null;
  let stats = null, all = null, byReg = null;
  if (bt) {
    all = btStats(bt.trades);
    const picked = bt.trades.filter((t) => t.regime && on[t.regime]), sel = btStats(picked);
    byReg = { calm: btStats(bt.trades.filter((t) => t.regime === 'calm')), trans: btStats(bt.trades.filter((t) => t.regime === 'trans')), stress: btStats(bt.trades.filter((t) => t.regime === 'stress')) };
    const note = { gridColumn: '1/-1', color: 'var(--muted)', fontSize: '13px' };
    stats = <>
      <div className="bt-head"><span>Trades taken</span><span style={{ textAlign: 'right' }}>Win rate</span><span style={{ textAlign: 'right' }}>Avg return</span></div>
      <div className="bt-row hero-row"><b>Every regime</b><span className="v">{f(all.win, 1)}%</span><span className="v">{sPct(all.avg, 2)}</span><span className="cnote" style={note}>{nIN(all.n)} trades · avg hold {Math.round(all.hold)} sessions</span></div>
      {['calm', 'trans', 'stress'].map((k) => {
        const st = byReg[k];
        return <div className="bt-row" key={k} style={on[k] ? undefined : { opacity: '.45' }}><b>{NAMES[k]}</b><span className="v">{st ? f(st.win, 1) + '%' : '—'}</span><span className="v">{st ? sPct(st.avg, 2) : '—'}</span>
          <span className="cnote" style={note}>{st ? nIN(st.n) + ' trades · best ' + sPct(st.best, 1) + ' · worst ' + sPct(st.worst, 1) : 'no trades'}</span></div>;
      })}
      {sel ? <>
        <div className="bt-row hero-row"><b>Your filter</b><span className="v">{f(sel.win, 1)}%</span><span className="v">{sPct(sel.avg, 2)}</span><span className="cnote" style={note}>{nIN(sel.n)} of {nIN(all.n)} trades kept</span></div>
        <p className="bt-delta">Trading this signal only in {list(Object.keys(on).filter((k) => on[k]).map((k) => NAMES[k].toLowerCase()))} regimes changes the win rate by <b>{(sel.win - all.win >= 0 ? '+' : '−') + f(Math.abs(sel.win - all.win), 1)} points</b> and the average trade by <b>{(sel.avg - all.avg >= 0 ? '+' : '−') + f(Math.abs(sel.avg - all.avg), 2)} points</b>, on {nIN(sel.n)} trades.</p>
      </> : <p className="bt-delta">No trades left with those regimes unticked.</p>}
    </>;
  }
  const options = keys.map((k) => ({ value: k, label: eod.backtests[k].name }));
  return (
    // markup: public/index.html #t-backtest+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-backtest" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Regime-conditioned backtester</span>{" "}<span className="level-badge">Stage 3</span><h2>The same strategy, with the wrong regimes filtered out</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-tech">Technical analysis</a>
          </dd>
          <dt>Statistics</dt>
          <dd>Two years, NIFTY 500, regime at entry</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> Test a rule, and split the result by the market’s state. <a href="#learn/l-a3" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">Every signal from the course, run across the NIFTY 500 over two years of real closes, then split by the regime the engine read on the day the trade opened. Untick a regime to see what the strategy looks like without it.</p>
      <div className="panel">
        <div className="panel-bar">
          <div className="pick">
            <label className="mono-label" htmlFor="btStrat">Strategy</label>
            <Dropdown id="btStrat" variant="pick" value={key} options={options} onChange={setPick} />
          </div>
          <Src id="btSrc" text={bt ? 'NIFTY 500 · ' + fmtDate(eod.dates[0]) + ' to ' + fmtDate(eod.asOf) + ' · ' + nIN(all.n) + ' trades' : null} live={false} />
        </div>
        <div className="panel-bar" style={{ borderBottom: "1px solid var(--rule)" }}>
          <div className="scan-bar" role="group" aria-label="Regimes to include">
            <span className="mono-label">Trade only in</span>
            <ChipToggle type="button" className="chipbtn" data-r="calm" aria-pressed="true" attr="data-r" on={on} onToggle={toggle}>Calm</ChipToggle>
            <ChipToggle type="button" className="chipbtn" data-r="trans" aria-pressed="true" attr="data-r" on={on} onToggle={toggle}>Transitional</ChipToggle>
            <ChipToggle type="button" className="chipbtn" data-r="stress" aria-pressed="true" attr="data-r" on={on} onToggle={toggle}>Stress</ChipToggle>
          </div>
          <span className="src" id="btRule">{bt ? bt.name : null}</span>
        </div>
        <div className="bt-main">
          <div className="bt-stats" id="btStats" aria-live="polite">{stats}</div>
          <div className="bt-chart">
            <span className="mono-label">Win rate and average return by regime</span>
            <BtChart byReg={byReg} all={all} on={on} />
          </div>
        </div>
        <p className="hint" style={{ padding: "0 20px 16px" }}>Entries and exits both fill at the next session's close, so no bar is used before it exists. No brokerage, slippage or taxes are deducted, and past results are not a forecast.</p>
      </div>
    </Reveal>
  );
}
