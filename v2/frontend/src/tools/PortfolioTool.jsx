// Portfolio fragility scanner (original parseHoldings, renderPortfolio).
import { useEffect, useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, fmtDate } from '../lib/format.js';
import { mds } from '../lib/quant.js';
import { postJson } from '../lib/api.js';
import { Pill, Src } from '../components/common.jsx';
import Reveal from '../motion/Reveal.jsx';

const PF_EXAMPLE = 'HDFCBANK 18\nICICIBANK 14\nTCS 12\nINFY 10\nRELIANCE 14\nITC 8\nMARUTI 8\nSUNPHARMA 8\nTATASTEEL 8';
function parseHoldings(text) {
  return text.split(/\n+/).map((line) => {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean);
    if (!parts.length) return null;
    const sym = parts[0].toUpperCase().replace(/[^A-Z0-9&\-]/g, '');
    const w = parts.length > 1 ? parseFloat(parts[1].replace(/[%₹,]/g, '')) : 1;
    if (!sym) return null;
    return { sym, weight: Number.isFinite(w) && w > 0 ? w : 1 };
  }).filter(Boolean);
}

function Report({ rep }) {
  if (rep.error) return <p className="note warn">{rep.error}{rep.missing && rep.missing.length ? ' Not found: ' + rep.missing.join(', ') + '.' : ''}</p>;
  const n = rep.symbols.length, grade = rep.effN / n;
  const verdict = grade > 0.55 ? 'pass' : grade > 0.35 ? 'watch' : 'flag';
  const pts = mds(rep.D), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
  const W = 320, H = 200, pad = 26;
  const X = (v) => pad + (v - minx) / ((maxx - minx) || 1) * (W - 2 * pad);
  const Y = (v) => H - pad - (v - miny) / ((maxy - miny) || 1) * (H - 2 * pad);
  const inCluster = {};
  rep.clusters.forEach((c) => c.members.forEach((m) => { inCluster[m] = true; }));
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rep.D[i][j] < 0.9) edges.push(<line key={i + '-' + j} className="pf-edge" x1={X(pts[i][0])} y1={Y(pts[i][1])} x2={X(pts[j][0])} y2={Y(pts[j][1])} />);
  return <>
    <div className="pf-score">
      <div><div className="ro-k">Holdings</div><div className="ro-v">{n}</div></div>
      <div><div className="ro-k">Effective independent bets</div><div className="ro-v">{f(rep.effN, 1)}</div></div>
      <div><div className="ro-k">Mean pairwise ρ</div><div className="ro-v">{f(rep.meanRho, 2)}</div></div></div>
    <p className="note"><Pill st={verdict} label={verdict === 'pass' ? '✓ Spread out' : verdict === 'watch' ? '! Concentrated' : '✕ Tightly coupled'} /> Your {n} holdings behave like about <b>{f(rep.effN, 1)}</b> independent positions over the last {rep.window} sessions. {grade > 0.55 ? 'That is a genuinely spread-out book.' : grade > 0.35 ? 'Some of the diversification is cosmetic.' : 'Most of these move together: the book is close to one bet.'}</p>
    {rep.clusters.length ? (
      <div style={{ marginTop: '16px' }}><span className="mono-label">Tightly coupled groups (ρ ≥ 0.6)</span>
        {rep.clusters.map((c, i) => (
          <div className="cluster" key={i}><b>{f(c.weight * 100, 0)}% of the book moves as one</b><div className="syms">{c.members.join(' · ')}</div>
            <p>Average correlation inside the group {f(c.meanRho, 2)}{c.sectors.length > 1 ? '. It spans ' + c.sectors.length + ' industries (' + c.sectors.slice(0, 4).join(', ') + '), so a sector breakdown would not show this as concentration.' : '.'}</p></div>
        ))}
      </div>
    ) : <p className="note" style={{ marginTop: '14px' }}>No group of holdings is correlated at 0.6 or above.</p>}
    <div className="pf-map"><span className="mono-label">Your book in correlation space · closer means moving together</span>
      <svg viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Map of the portfolio in correlation space">
        {edges}
        {rep.symbols.map((sym, i) => [
          <circle key={sym + 'c'} className={'pf-dot' + (inCluster[sym] ? ' hot' : '')} cx={X(pts[i][0])} cy={Y(pts[i][1])} r={(4 + Math.sqrt(rep.weights[i]) * 8).toFixed(1)} />,
          <text key={sym + 't'} x={X(pts[i][0])} y={Y(pts[i][1]) - 9} textAnchor="middle">{sym}</text>,
        ])}
      </svg></div>
    <div style={{ marginTop: '14px' }}><span className="mono-label">Most coupled holdings</span><div className="tbl-scroll"><table className="data-tbl"><thead><tr><th className="l">Stock</th><th className="l">Industry</th><th>Weight</th><th>Avg ρ with the rest</th></tr></thead><tbody>
      {rep.perHolding.slice(0, 8).map((r) => <tr key={r.sym}><th scope="row" className="l"><b>{r.sym}</b></th><td className="l">{r.industry}</td><td>{f(r.weight * 100, 1)}%</td><td>{f(r.avgRho, 2)}</td></tr>)}
    </tbody></table></div></div>
    {rep.missing && rep.missing.length ? <p className="note warn">No price history for: {rep.missing.join(', ')}. They were left out.</p> : null}
  </>;
}

export default function PortfolioTool() {
  const { eod } = useData();
  const [text, setText] = useState('');
  const [out, setOut] = useState(null);      // null: the original's starting note
  const [src, setSrc] = useState(null);
  useEffect(() => { if (eod) setText((t) => t || PF_EXAMPLE); }, [eod]);

  const run = (value) => {
    const holdings = parseHoldings(value);
    if (holdings.length < 2) { setOut(<p className="note warn">Give at least two holdings, one per line.</p>); return; }
    setOut(<p className="note">Scanning {holdings.length} holdings…</p>);
    postJson('/api/portfolio', { holdings }).then((rep) => {
      setOut(<Report rep={rep} />);
      if (!rep.error && eod) setSrc('NSE closes · ' + rep.window + '-session window to ' + fmtDate(eod.asOf));
    }).catch((e) => setOut(<p className="note warn">{String(e.message || e)}</p>));
  };
  return (
    // markup: public/index.html #t-portfolio+decorate (filled by v2/tools/fill_markup.py)
    <>
      <Reveal className="tool" id="t-portfolio" as="section" stagger={0.08}>
        <div className="tool-head">
          <div><span className="mono-label">Portfolio fragility scanner</span>{" "}<span className="level-badge">Stage 3</span><h2>Your own holdings, checked for hidden concentration</h2></div>
          <dl className="tool-meta">
            <dt>Pillar</dt>
            <dd>
              <a href="#learn/p-risk">Risk management</a>
            </dd>
            <dt>Statistics</dt>
            <dd>60-day correlations across your basket</dd>
          </dl>
        </div>
        <p className="tool-plain"><b>In plain words:</b> Check your own holdings for concentration a sector list hides. <a href="#learn/l-a3" className="practise">Read the lesson first →</a></p>
        <p className="tool-intro">Paste your holdings. The engine isolates that basket, measures how tightly it is coupled, and names the groups that move as one — the concentration a sector breakdown hides.</p>
        <div className="panel">
          <div className="panel-bar">
            <span className="mono-label">Holdings · symbol and weight per line, or CSV</span>
            <Src id="pfSrc" text={src} live={false} />
          </div>
          <div className="pf">
            <div className="pf-form">
              <label className="mono-label" htmlFor="pfText">Your holdings</label>
              <textarea id="pfText" rows="10" spellCheck="false" value={text} onChange={(e) => setText(e.target.value)} />
              <p className="hint">NSE symbols from the NIFTY 500. Weights are optional and are rescaled to 100%.</p>
              <div className="trade-row">
                <button type="button" className="btn btn-primary btn-sm" id="pfRun" onClick={() => run(text)}>Scan the portfolio</button>
                <button type="button" className="chipbtn" id="pfExample" onClick={() => { setText(PF_EXAMPLE); run(PF_EXAMPLE); }}>Load an example</button>
              </div>
            </div>
            <div className="pf-out" id="pfOut" aria-live="polite">{out || <p className="note">Paste holdings and run the scan.</p>}</div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
