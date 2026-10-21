// Pattern and breakout scanner (original renderScanner).
import { useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { useEngine } from '../state/EngineContext.jsx';
import { f, fmtDate, nIN, sPct } from '../lib/format.js';
import { Src } from '../components/common.jsx';
import { ChipOption } from '../components/chips.jsx';
import Reveal from '../motion/Reveal.jsx';

const REGIME_HINT = { ma: 'Confirm with volume: moving-average crosses fail more often when breadth is thin.', pattern: 'Wait for a close beyond the level, and check the volume column.', rsi: 'In a trend, RSI can stay extreme for weeks. Treat it as a warning, not a signal.' };

function Spark({ spark }) {
  const mn = Math.min.apply(null, spark), mx = Math.max.apply(null, spark), y = (v) => 31 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * 28;
  return <svg className="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><polyline className="s-line" points={spark.map((v, i) => (i / (spark.length - 1) * 120).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')} /></svg>;
}

export default function ScannerTool() {
  const { eod } = useData();
  const { scanRegime } = useEngine();
  const [filter, setFilter] = useState('all');
  let table = null;
  if (eod) {
    const rows = eod.scan.filter((r) => filter === 'all' || r.group === filter).slice(0, 25);
    table = <>
      <thead><tr><th scope="col">Stock</th><th scope="col" className="l">Signal</th><th scope="col" className="l">Last 60 sessions</th><th scope="col">Close</th><th scope="col">Volume vs 20-day</th><th scope="col" className="l">Learn it</th><th scope="col" className="l">Regime check</th></tr></thead>
      <tbody>
        {!rows.length && <tr><td className="l" colSpan={7} style={{ color: 'var(--muted)' }}>No stock in the NIFTY 500 triggered this signal on {fmtDate(eod.asOf)}.</td></tr>}
        {rows.map((r, i) => (
          <tr key={r.sym + i}><th scope="row"><b>{r.sym}</b><span>{r.name}</span></th><td className="sig">{r.sig}</td><td className="l"><Spark spark={r.spark} /></td>
            <td>₹{nIN(r.close, 2)} <span className={r.chg >= 0 ? 'pos' : 'neg'}>{sPct(r.chg, 1)}</span></td><td className="vol">{r.volRatio ? f(r.volRatio, 1) + '×' : '—'}</td>
            <td className="l"><a href="#learn/p-tech">{r.group === 'rsi' ? 'RSI' : r.group === 'ma' ? 'Moving averages' : 'Chart patterns'} →</a></td><td className="l">{REGIME_HINT[r.group]}</td></tr>
        ))}
      </tbody>
    </>;
  }
  return (
    // markup: public/index.html #t-scanner+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-scanner" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Pattern &amp; breakout scanner</span>{" "}<span className="level-badge">Stage 2</span><h2>The NIFTY 500, screened for the patterns you just learned</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-tech">Technical analysis</a>
          </dd>
          <dt>Statistics</dt>
          <dd>200-day MA, RSI, volume, 52-week range</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> Find the stocks doing the things you have just learned. <a href="#learn/l-m1" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">Every NIFTY 500 stock with a year of price history is checked for the course's signals, then each hit is read against the current regime.</p>
      <div className="panel">
        <div className="panel-bar">
          <div className="scan-bar" role="group" aria-label="Filter signals">
            <ChipOption type="button" className="chipbtn" data-f="all" aria-pressed="true" attr="data-f" active={filter} onPick={setFilter}>All</ChipOption>
            <ChipOption type="button" className="chipbtn" data-f="ma" aria-pressed="false" attr="data-f" active={filter} onPick={setFilter}>Moving-average crosses</ChipOption>
            <ChipOption type="button" className="chipbtn" data-f="pattern" aria-pressed="false" attr="data-f" active={filter} onPick={setFilter}>Breakouts &amp; patterns</ChipOption>
            <ChipOption type="button" className="chipbtn" data-f="rsi" aria-pressed="false" attr="data-f" active={filter} onPick={setFilter}>RSI extremes</ChipOption>
          </div>
          <Src id="scanSrc" text={eod ? 'NSE end-of-day ' + fmtDate(eod.asOf) + ' · ' + eod.scanUniverse + ' stocks scanned · ' + eod.scan.length + ' hits' : null} live={false} />
        </div>
        <div className="panel-bar" style={{ borderBottom: "1px solid var(--rule)" }}>
          <div className="regime-strip">
            <span className="mono-label">Regime check</span>
            <b id="scanRegime">{scanRegime ? scanRegime.name : '—'}</b>
            <span id="scanRegimeNote">{scanRegime ? scanRegime.note : null}</span>
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="data-tbl scanner" id="scanner">{table}</table>
        </div>
      </div>
    </Reveal>
  );
}
