// Topo-Screen (original renderTopo).
import { useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, fmtDate, nIN, sPct } from '../lib/format.js';
import { Src } from '../components/common.jsx';
import { ChipOption } from '../components/chips.jsx';
import Reveal from '../motion/Reveal.jsx';

export default function TopoTool() {
  const { eod } = useData();
  const [sort, setSort] = useState('isolated');
  const [find, setFind] = useState('');
  let table = null, count = null;
  if (eod && eod.topo) {
    const q = (find || '').trim().toUpperCase();
    let rows = eod.topo.slice();
    if (q) rows = rows.filter((r) => (r.sym + ' ' + r.name + ' ' + r.industry).toUpperCase().indexOf(q) >= 0);
    const total = rows.length;
    if (sort === 'isolated') rows.sort((a, b) => b.dist - a.dist);
    else if (sort === 'coupled') rows.sort((a, b) => a.dist - b.dist);
    else if (sort === 'breakout') rows.sort((a, b) => a.corrChg - b.corrChg);
    else rows.sort((a, b) => b.corrChg - a.corrChg);
    rows = rows.slice(0, 30);
    table = <>
      <thead><tr><th scope="col">Stock</th><th scope="col" className="l">Industry</th><th scope="col">Close</th><th scope="col">RSI</th><th scope="col">Distance from cluster</th><th scope="col">Avg ρ with market</th><th scope="col">Δ ρ, 30 sessions</th></tr></thead>
      <tbody>
        {!rows.length && <tr><td className="l" colSpan={7} style={{ color: 'var(--muted)' }}>Nothing matches that search.</td></tr>}
        {rows.map((r) => (
          <tr key={r.sym}><th scope="row"><b>{r.sym}</b><span>{r.name}</span></th><td className="l">{r.industry}</td>
            <td>₹{nIN(r.close, 2)} <span className={r.chg >= 0 ? 'pos' : 'neg'}>{sPct(r.chg, 1)}</span></td>
            <td>{Math.round(r.rsi)}</td><td>{f(r.dist, 2)}</td><td>{f(r.avgCorr, 2)}</td>
            <td className={r.corrChg <= 0 ? 'pos' : 'neg'}>{(r.corrChg >= 0 ? '+' : '−') + f(Math.abs(r.corrChg), 2)}</td></tr>
        ))}
      </tbody>
    </>;
    count = 'showing ' + rows.length + ' of ' + total + ' stocks';
  }
  return (
    // markup: public/index.html #t-topo+decorate (filled by v2/tools/fill_markup.py)
    <>
      <Reveal className="tool" id="t-topo" as="section" stagger={0.08}>
        <div className="tool-head">
          <div><span className="mono-label">Topo-Screen</span>{" "}<span className="level-badge">Stage 3</span><h2>Screen the market by its topology, not just its prices</h2></div>
          <dl className="tool-meta">
            <dt>Pillar</dt>
            <dd>
              <a href="#engine">Regime engine</a>
            </dd>
            <dt>Statistics</dt>
            <dd>Correlation distance, 30-day correlation change</dd>
          </dl>
        </div>
        <p className="tool-plain"><b>In plain words:</b> Rank stocks by how independently they move. <a href="#learn/l-a3" className="practise">Read the lesson first →</a></p>
        <p className="tool-intro">Two columns no other screener has. <b>Distance from the cluster</b> is how far a stock sits from the rest of the market in correlation space: high means it is moving on its own, which is where a hedge or a genuine safe haven comes from. <b>Correlation change</b> is how much that has shifted in a month: a large negative number means the stock has just broken out of the pack.</p>
        <div className="panel">
          <div className="panel-bar">
            <div className="scan-bar" role="group" aria-label="Sort Topo-Screen">
              <ChipOption type="button" className="chipbtn" data-t="isolated" aria-pressed="true" attr="data-t" active={sort} onPick={setSort}>Most isolated</ChipOption>
              <ChipOption type="button" className="chipbtn" data-t="breakout" aria-pressed="false" attr="data-t" active={sort} onPick={setSort}>Breaking out of the cluster</ChipOption>
              <ChipOption type="button" className="chipbtn" data-t="coupled" aria-pressed="false" attr="data-t" active={sort} onPick={setSort}>Most coupled</ChipOption>
              <ChipOption type="button" className="chipbtn" data-t="joining" aria-pressed="false" attr="data-t" active={sort} onPick={setSort}>Joining the cluster</ChipOption>
            </div>
            <Src id="topoSrc" text={eod && eod.topo ? 'NSE end-of-day ' + fmtDate(eod.asOf) + ' · 60-session correlations across ' + eod.topo.length + ' stocks' : null} live={false} />
          </div>
          <div className="panel-bar" style={{ borderBottom: "1px solid var(--rule)" }}>
            <div className="pick">
              <label className="mono-label" htmlFor="topoFind">Find</label>
              <input className="pick-sel" id="topoFind" type="search" placeholder="symbol or industry" style={{ minWidth: '200px' }} value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
            <span className="src" id="topoCount">{count}</span>
          </div>
          <div className="tbl-scroll">
            <table className="data-tbl scanner" id="topoTable">{table}</table>
          </div>
        </div>
      </Reveal>
    </>
  );
}
