// Engine page: the original markup, with FIG. 1, the running candidates, Ask and Replay as
// components, and the regime column that matches FIG. 1 highlighted as before.
import { useEngine } from '../state/EngineContext.jsx';
import { useData } from '../state/DataContext.jsx';
import Fig1 from '../engine/Fig1.jsx';
import { CandStatus, P1, P2, P3, P4, P5, P6, P7 } from '../engine/Candidates.jsx';
import Ask from '../engine/Ask.jsx';
import Replay from '../engine/Replay.jsx';
import Reveal from '../motion/Reveal.jsx';
import Spot from '../motion/Spot.jsx';

/* .regime[data-reg] gets "now" when FIG. 1's window is in that regime */
function Regime({ className, ...p }) {
  const { EG, fig, regimeOf } = useEngine();
  const now = !!(EG && fig) && regimeOf(fig.rho) === p['data-reg'];
  return <div className={className + (now ? ' now' : '')} {...p} />;
}

export default function Engine() {
  const { eod } = useData();
  const { EG } = useEngine();
  return (
    // markup: public/index.html page:engine (filled by v2/tools/fill_markup.py)
    <>
      <section className="wrap phead">
        <div className="eyebrow mono-label">
          <span>Regime engine</span>
          <span>Topological data analysis</span>
        </div>
        <h1>The market changes state. The lessons should too.</h1>
        <div className="primer">
          <span className="mono-label">In plain words</span>
          <p>Every share moves for two reasons: something about that company, and something about the market as a whole. When the second reason takes over, sectors that normally go their own way start moving together — and the ordinary rules stop behaving.</p>
          <p>This page measures that directly, from how closely NSE's sector indices move together. New to the idea? <a href="#learn/a3">Lesson 11 explains regimes</a> and <a href="#learn/a4">lesson 12 explains the barcode</a>, both without mathematics.</p>
        </div>
        <nav className="index" aria-label="Engine sections">
          <a href="#engine/candidates-live">Candidates running</a>
          <a href="#engine/ask">Ask the engine</a>
          <a href="#engine/replay">Crash replay</a>
          <a href="#engine/regimes">Regimes → lessons</a>
          <a href="#engine/candidates">The written claims</a>
        </nav>
        <p className="intro">Courses teach RSI, stop-losses and valuation as if the market always behaves the same way. It doesn't. The engine takes <span id="egSectors">{EG ? EG.codes.length : 18}</span> NSE sector indices, measures how closely they have moved together over a 60-day window, and reads the shape of that correlation structure with persistent homology.</p>
      </section>
      <section className="wrap">
        <div className="hero-grid wide-fig">
          <div className="engine-copy">
            <p>Each dot is a sector index, placed so that sectors which move together sit close. Persistent homology grows a radius ε around the dots and records when groups merge and when loops open and close. The record is the barcode on the right.</p>
            <p>Drag the window back through the last year and watch the shape change. When correlations rise, groups merge earlier and loops die young.</p>
            <ul className="key" aria-label="How to read FIG. 1">
              <li>
                <span className="swatch h0" />
                <span><b>H₀</b> · groups of sectors that move together. A bar ends when two groups merge.</span>
              </li>
              <li>
                <span className="swatch h1" />
                <span><b>H₁</b> · loops in the correlation structure. A bar runs from when a loop opens to when it fills in.</span>
              </li>
            </ul>
            <p className="wide-note">Distances come from the correlation matrix: d = √(2(1 − ρ)) on daily log returns. The dots are a 2-D projection (classical MDS) of those distances, so the picture approximates what the barcode measures exactly.</p>
          </div>
          <Fig1 />
        </div>
      </section>
      <Reveal className="wrap sec" id="candidates-live" as="section">
        <div className="sec-label mono-label">Candidates, running</div>
        <div>
          <h2>The seven patent candidates, as working code</h2>
          <p className="intro">Each panel below runs on the data this machine has already downloaded, and says plainly where the prototype stops short of the claim.</p>
          <div className="tbl-scroll">
            <table className="data-tbl" id="candStatus">{eod ? <CandStatus /> : null}</table>
          </div>
          <P1 />
          <P2 />
          <P3 />
          <P4 />
          <P5 />
          <P6 />
          <P7 />
        </div>
      </Reveal>
      <Ask />
      <Replay />
      <Reveal className="wrap sec" id="regimes" as="section">
        <div className="sec-label mono-label">Regimes → lessons</div>
        <div>
          <h2>What each regime changes for a learner</h2>
          <p className="intro">The engine's output isn't only an alert. It changes which lessons and tools Sthiti puts in front of you. The highlighted column follows FIG. 1's market state.</p>
          <div className="regimes">
            <Regime className="regime" data-reg="calm">
              <h3>Calm <span className="now-tag">FIG. 1 now</span></h3>
              <dl>
                <dt>What the engine sees</dt>
                <dd>Distinct sector groups and stable loops; correlations are moderate.</dd>
                <dt>What Sthiti surfaces</dt>
                <dd>Fundamentals and chart patterns behave as taught. The scanner runs normally.</dd>
              </dl>
              <a href="#tools/t-screen">Stock health scorecard →</a>
            </Regime>
            <Regime className="regime" data-reg="trans">
              <h3>Transitional <span className="now-tag">FIG. 1 now</span></h3>
              <dl>
                <dt>What the engine sees</dt>
                <dd>Loops thinning and groups merging earlier as correlations rise.</dd>
                <dt>What Sthiti surfaces</dt>
                <dd>Tighter stops, a breadth check, and confirmation before trusting a breakout.</dd>
              </dl>
              <a href="#tools/t-position">Position calculator →</a>
            </Regime>
            <Regime className="regime" data-reg="stress">
              <h3>Stress <span className="now-tag">FIG. 1 now</span></h3>
              <dl>
                <dt>What the engine sees</dt>
                <dd>Correlations converge and the structure collapses into one blob.</dd>
                <dt>What Sthiti surfaces</dt>
                <dd>Smaller positions, hedging with options, and the psychology lesson on panic selling.</dd>
              </dl>
              <a href="#tools/t-options">Option simulator →</a>
            </Regime>
          </div>
        </div>
      </Reveal>
      <Reveal className="wrap sec" id="system" as="section">
        <div className="sec-label mono-label">System</div>
        <div>
          <h2>Seven claims, one engine</h2>
          <p className="intro">The patent candidates fit together as a single pipeline, from the NSE feed to a hedge or a lesson. One way to file: claim the whole system, then claim each module in its own right.</p>
          <div className="engine" role="list" aria-label="FIG. 9, proposed system">
            <div className="aux tune" role="listitem"><span className="mono-label">Candidate 4 · wraps these three</span><b>Self-calibration</b> tunes window, embedding, delay and threshold per market, and re-tunes on drift.</div>
            <div className="stage in e-feed" role="listitem">
              <span className="mono-label">Input</span>
              <b>NSE market feed</b>
              <p>Ticks and bars across NIFTY 500, F&amp;O, INR and G-secs</p>
            </div>
            <div className="stage e-s1" role="listitem">
              <span className="mono-label">Candidate 1</span>
              <b>
                <a href="#engine/c1">Streaming complex</a>
              </b>
              <p>Update only the simplices each tick touches</p>
            </div>
            <div className="stage e-s3" role="listitem">
              <span className="mono-label">Candidate 3</span>
              <b>
                <a href="#engine/c3">Regime fingerprint</a>
              </b>
              <p>Correlation × liquidity bifiltration</p>
            </div>
            <div className="stage e-s5" role="listitem">
              <span className="mono-label">Candidate 5</span>
              <b>
                <a href="#engine/c5">Surrogate gate</a>
              </b>
              <p>Fire only if the signal beats the null</p>
            </div>
            <div className="stage e-s2" role="listitem">
              <span className="mono-label">Candidate 2</span>
              <b>
                <a href="#engine/c2">Attribution report</a>
              </b>
              <p>Ranked assets and sectors behind the shift</p>
            </div>
            <div className="stage out e-act" role="listitem">
              <span className="mono-label">Output</span>
              <b>Action &amp; lesson</b>
              <p>Hedge, limits, retrain, or the lesson that fits the new state</p>
            </div>
            <div className="aux iv" role="listitem"><span className="mono-label">Candidate 7 · feeds the fingerprint</span><b>IV-surface monitor</b> adds a derivatives signal that may lead the cash market.</div>
            <div className="aux zz" role="listitem"><span className="mono-label">Candidate 6 · feeds the report</span><b>Contagion map</b> traces the shock across equities, bonds, FX, commodities and crypto.</div>
          </div>
          <p className="engine-note"><span className="mono-label">FIG. 9</span> Proposed system. Solid boxes run in sequence on every update; blue dashed boxes tune or feed them.</p>
        </div>
      </Reveal>
      <Reveal className="wrap sec" id="candidates" as="section">
        <div className="sec-label mono-label">Patent candidates</div>
        <div>
          <h2>Seven patent candidates</h2>
          <p className="intro">Numbered as in the brief: 1 is the strongest candidate under Indian law, 7 the least certain on novelty. Figures are drawn in patent style, with reference numerals.</p>
          <div className="cands">
            <Spot className="cand" id="c1" as="article">
              <div className="cand-num">1</div>
              <div>
                <h3>Streaming persistent homology engine</h3>
                <span className="standing strong">Strongest candidate</span>
                <p className="claim"><span className="mono-label">Claim sketch</span>When each new bar or tick arrives, update only the simplices it affects instead of rebuilding the diagram, and emit a regime alert within a bounded time and memory budget.</p>
                <p className="why">Recomputing every window from scratch can't keep up with hundreds of assets at intraday frequency.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="1" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Vineyard-style updating already exists in pure mathematics, so the novelty has to sit in the specific finance pipeline and architecture. Lower latency and memory use is a clear technical effect, which is what Indian law looks for.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="A price series with a sliding window; a new tick updates one triangle in the complex above">
                  <path className="ln" d="M40 56 L78 30 L108 62 Z" />
                  <path className="ln" d="M108 62 L150 38" />
                  <path className="acf" d="M150 38 L196 60 L108 62 Z" />
                  <circle className="dot" cx="40" cy="56" r="3" />
                  <circle className="dot" cx="78" cy="30" r="3" />
                  <circle className="dot" cx="108" cy="62" r="3" />
                  <circle className="dot" cx="150" cy="38" r="3" />
                  <circle className="dot" cx="196" cy="60" r="3" />
                  <polyline className="ln" points="12,134 28,126 44,130 60,118 76,123 92,112 108,119 124,106 140,113 156,100 172,108 188,97 204,104 220,92" />
                  <rect className="lt" x="120" y="84" width="92" height="58" />
                  <path className="acd" d="M220 86 Q224 70 200 66" />
                  <circle className="adot" cx="220" cy="92" r="4" />
                  <path className="ld" d="M108 150 L120 142" />
                  <text className="ref" x="88" y="156">210</text>
                  <path className="ld" d="M228 104 L223 97" />
                  <text className="ref" x="222" y="115">212</text>
                  <path className="ld" d="M206 30 L178 46" />
                  <text className="ref" x="208" y="30">214</text>
                </svg>
                <figcaption><b>FIG. 2</b> A new tick (212) updates one simplex (214) inside the sliding window (210).</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c2" as="article">
              <div className="cand-num">2</div>
              <div>
                <h3>Topological regime attribution</h3>
                <span className="standing strong">Nothing comparable found</span>
                <p className="claim"><span className="mono-label">Claim sketch</span>When a shift is detected, extract the representative cycles and components that caused it, map them back to individual assets and sectors, and output a ranked “who drove this shift” report.</p>
                <p className="why">“The landscape norm spiked” gives a portfolio manager nothing to act on. A ranked list of stocks and sectors does. FIG. 1 runs a toy version: the saffron loop is a representative cycle, read out by sector.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="2" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Representative cycles are standard TDA output. The claim is the mapping back to assets and the ranking built on it.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="A loop through five sector nodes feeding a ranked bar list">
                  <path className="ln" d="M92 106 L128 120 L142 98" />
                  <path className="ac" d="M66 32 L106 60 L92 106 L40 106 L26 60 Z" />
                  <circle className="dot" cx="66" cy="32" r="3" />
                  <circle className="dot" cx="106" cy="60" r="3" />
                  <circle className="dot" cx="92" cy="106" r="3" />
                  <circle className="dot" cx="40" cy="106" r="3" />
                  <circle className="dot" cx="26" cy="60" r="3" />
                  <circle className="dot" cx="128" cy="120" r="3" />
                  <circle className="dot" cx="142" cy="98" r="3" />
                  <text className="lab" x="66" y="22" textAnchor="middle">BNK</text>
                  <text className="lab" x="112" y="56">RLT</text>
                  <text className="lab" x="20" y="56" textAnchor="end">AUT</text>
                  <text className="lab" x="40" y="121" textAnchor="middle">MTL</text>
                  <text className="lab" x="92" y="121" textAnchor="middle">ENG</text>
                  <path className="ln" d="M122 76 L148 76 M143 72 L148 76 L143 80" />
                  <text className="lab" x="156" y="47">BNK</text>
                  <rect className="bar" x="178" y="40" width="54" height="8" rx="1.5" />
                  <text className="lab" x="156" y="65">AUT</text>
                  <rect className="bar" x="178" y="58" width="40" height="8" rx="1.5" />
                  <text className="lab" x="156" y="83">MTL</text>
                  <rect className="bar" x="178" y="76" width="28" height="8" rx="1.5" />
                  <text className="lab" x="156" y="101">RLT</text>
                  <rect className="bar" x="178" y="94" width="16" height="8" rx="1.5" />
                  <path className="ld" d="M22 138 L32 116" />
                  <text className="ref" x="10" y="150">310</text>
                  <path className="ld" d="M214 116 L198 104" />
                  <text className="ref" x="208" y="128">312</text>
                </svg>
                <figcaption><b>FIG. 3</b> The representative cycle (310) is mapped to sectors and ranked in the report (312).</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c3" as="article">
              <div className="cand-num">3</div>
              <div>
                <h3>Two-parameter regime fingerprint</h3>
                <p className="claim"><span className="mono-label">Claim sketch</span>Build a bifiltration on correlation distance crossed with a liquidity or stress variable, such as bid-ask spread or realized volatility, and define each regime as a region in the resulting multiparameter invariant.</p>
                <p className="why">A liquidity crunch and a correlation crash would finally look different. Single-parameter methods can't tell them apart.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="3" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Multiparameter persistence has no simple, complete invariant. The claim has to fix a computable one and show that it separates regimes.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="Two regime regions in a correlation-distance by spread plane">
                  <path className="inf" d="M31 22 L31 72 L72 72 L72 52 L112 52 L112 22 Z" />
                  <path className="acf" d="M31 131 L31 112 L124 112 L124 94 L186 94 L186 131 Z" />
                  <path className="ln" d="M30 16 L30 132 L228 132" />
                  <path className="ln" d="M26 21 L30 16 L34 21 M223 128 L228 132 L223 136" />
                  <text className="lab" x="36" y="12">spread / RV</text>
                  <text className="lab" x="228" y="148" textAnchor="end">correlation distance</text>
                  <text className="lab" x="52" y="45" textAnchor="middle">A</text>
                  <text className="lab" x="76" y="125" textAnchor="middle">B</text>
                  <path className="ld" d="M138 34 L114 40" />
                  <text className="ref" x="140" y="37">410</text>
                  <path className="ld" d="M204 86 L188 100" />
                  <text className="ref" x="206" y="86">412</text>
                </svg>
                <figcaption><b>FIG. 4</b> Regimes as regions of the bifiltration: a liquidity crunch (410) and a correlation crash (412).</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c4" as="article">
              <div className="cand-num">4</div>
              <div>
                <h3>Self-calibrating TDA pipeline</h3>
                <p className="claim"><span className="mono-label">Claim sketch</span>Automatically choose window length, embedding dimension, delay and threshold for each market by maximizing diagram stability on calm periods while holding the false-alarm rate below a target, and re-tune when the data's character changes.</p>
                <p className="why">Every early-warning paper admits its results depend on these parameters. Nobody offers automatic, market-specific calibration.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="4" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Generic hyperparameter search won't carry a claim. The stability objective, the false-alarm constraint and the drift-triggered re-tune, taken together, might.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="Stability against window length, with the chosen window at the peak and a re-tune loop">
                  <path className="ln" d="M28 16 L28 132 L228 132" />
                  <path className="ln" d="M24 21 L28 16 L32 21 M223 128 L228 132 L223 136" />
                  <text className="lab" x="34" y="12">stability</text>
                  <text className="lab" x="228" y="148" textAnchor="end">window length</text>
                  <path className="ln" d="M34 122 C64 116 88 44 120 42 C150 40 176 88 222 108" />
                  <path className="acd" d="M120 132 L120 48" />
                  <circle className="adot" cx="120" cy="42" r="4" />
                  <text className="lab" x="125" y="126">w*</text>
                  <path className="ln" d="M204 36 A11 11 0 1 1 193 25" />
                  <path className="ln" d="M188 21 L193 25 L188 29" />
                  <text className="lab" x="196" y="60" textAnchor="middle">re-tune</text>
                  <path className="ld" d="M170 70 L158 61" />
                  <text className="ref" x="170" y="79">510</text>
                  <path className="ld" d="M104 142 L117 134" />
                  <text className="ref" x="84" y="150">512</text>
                  <path className="ld" d="M220 22 L210 27" />
                  <text className="ref" x="214" y="18">514</text>
                </svg>
                <figcaption><b>FIG. 5</b> The stability curve (510) sets the window w* (512); drift in the data triggers a re-tune (514).</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c5" as="article">
              <div className="cand-num">5</div>
              <div>
                <h3>Topological drift detector for AI trading models</h3>
                <p className="claim"><span className="mono-label">Claim sketch</span>Test each topological signal against surrogate null data, such as phase-randomized series, and only when it beats the null, trigger retraining, de-risking or margin changes.</p>
                <p className="why">Practitioners treat detecting shifts in market behaviour as central to model governance, because it signals when a machine learning model needs retraining. This turns a signal into a controlled action.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="5" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Surrogate testing is established in nonlinear time-series analysis. The claim is the gate between a topological test and a risk action.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="Histogram of surrogate statistics with the observed value beyond the 95th percentile, triggering a retrain">
                  <rect className="hist" x="20" y="122" width="10" height="6" />
                  <rect className="hist" x="32" y="115" width="10" height="13" />
                  <rect className="hist" x="44" y="104" width="10" height="24" />
                  <rect className="hist" x="56" y="91" width="10" height="37" />
                  <rect className="hist" x="68" y="78" width="10" height="50" />
                  <rect className="hist" x="80" y="72" width="10" height="56" />
                  <rect className="hist" x="92" y="79" width="10" height="49" />
                  <rect className="hist" x="104" y="92" width="10" height="36" />
                  <rect className="hist" x="116" y="105" width="10" height="23" />
                  <rect className="hist" x="128" y="116" width="10" height="12" />
                  <rect className="hist" x="140" y="123" width="10" height="5" />
                  <path className="ln" d="M14 128 L230 128" />
                  <path className="lt" d="M152 128 L152 58" />
                  <text className="lab" x="152" y="52" textAnchor="middle">95%</text>
                  <path className="ac" d="M186 128 L186 64" />
                  <circle className="adot" cx="186" cy="62" r="4" />
                  <text className="lab" x="186" y="142" textAnchor="middle">observed</text>
                  <rect className="ln" x="162" y="10" width="68" height="22" rx="2" />
                  <text className="lab" x="196" y="24" textAnchor="middle">retrain</text>
                  <path className="ac" d="M188 56 L194 36 M189 39 L194 35 L197 40" />
                  <path className="ld" d="M40 142 L56 118" />
                  <text className="ref" x="26" y="152">610</text>
                  <path className="ld" d="M214 82 L190 72" />
                  <text className="ref" x="214" y="90">612</text>
                  <path className="ld" d="M150 20 L161 20" />
                  <text className="ref" x="128" y="24">614</text>
                </svg>
                <figcaption><b>FIG. 6</b> The observed statistic (612) clears the surrogate null (610) and opens the action gate (614).</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c6" as="article">
              <div className="cand-num">6</div>
              <div>
                <h3>Cross-asset contagion map with zigzag persistence</h3>
                <p className="claim"><span className="mono-label">Claim sketch</span>Track cycles as they form and dissolve across a multilayer network linking equities, bonds, FX, commodities and crypto over time, and identify the pathway a shock is taking.</p>
                <p className="why">Zigzag persistence has revealed structure in temporal graphs that standard centrality statistics miss. The published examples are transport networks, not financial contagion.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="6" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>Zigzag persistence itself is known. Applying it to cross-asset contagion paths looks unexplored.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="Three network layers at successive times with a shock path crossing them">
                  <path className="ln" d="M18 42 L70 26 L70 118 L18 134 Z" />
                  <path className="ln" d="M92 42 L144 26 L144 118 L92 134 Z" />
                  <path className="ln" d="M166 42 L218 26 L218 118 L166 134 Z" />
                  <path className="lt" d="M32 62 L54 50 M32 62 L40 96 M40 96 L58 106" />
                  <path className="lt" d="M106 62 L128 50 M114 92 L132 104 M106 62 L114 92" />
                  <path className="lt" d="M180 62 L202 50 M188 94 L206 104 M202 50 L206 104" />
                  <circle className="dot" cx="54" cy="50" r="2.6" />
                  <circle className="dot" cx="40" cy="96" r="2.6" />
                  <circle className="dot" cx="58" cy="106" r="2.6" />
                  <circle className="dot" cx="106" cy="62" r="2.6" />
                  <circle className="dot" cx="128" cy="50" r="2.6" />
                  <circle className="dot" cx="132" cy="104" r="2.6" />
                  <circle className="dot" cx="180" cy="62" r="2.6" />
                  <circle className="dot" cx="202" cy="50" r="2.6" />
                  <circle className="dot" cx="188" cy="94" r="2.6" />
                  <path className="ac" d="M32 62 L114 92 L206 104" />
                  <circle className="adot" cx="32" cy="62" r="3.6" />
                  <circle className="adot" cx="114" cy="92" r="3.6" />
                  <circle className="adot" cx="206" cy="104" r="3.6" />
                  <text className="lab" x="30" y="78" textAnchor="middle">EQ</text>
                  <text className="lab" x="104" y="108" textAnchor="middle">FX</text>
                  <text className="lab" x="200" y="122" textAnchor="middle">BOND</text>
                  <text className="lab" x="44" y="150" textAnchor="middle">t</text>
                  <text className="lab" x="118" y="150" textAnchor="middle">t+1</text>
                  <text className="lab" x="192" y="150" textAnchor="middle">t+2</text>
                  <path className="ld" d="M78 18 L66 28" />
                  <text className="ref" x="80" y="18">710</text>
                  <path className="ld" d="M150 76 L160 96" />
                  <text className="ref" x="142" y="72">712</text>
                </svg>
                <figcaption><b>FIG. 7</b> Network layers (710) at successive times; the shock's path (712) runs from equities through FX to bonds.</figcaption>
              </figure>
            </Spot>
            <Spot className="cand" id="c7" as="article">
              <div className="cand-num">7</div>
              <div>
                <h3>Topology of the options implied-volatility surface</h3>
                <span className="standing caution">Least certain · search hardest</span>
                <p className="claim"><span className="mono-label">Claim sketch</span>Apply a sublevel-set filtration over the strike × expiry implied-volatility surface and detect regime shifts in derivatives before the cash market reacts.</p>
                <p className="why">NSE's huge options volume makes this a natural fit for Indian data.</p>
                <dl className="meta">
                  <dt className="mono-label">Closes</dt>
                  <dd>
                    <ul className="chips" data-cand="7" />
                  </dd>
                  <dt className="mono-label">Novelty watch</dt>
                  <dd>The least certain novelty in the set. Run the hardest search here before spending on drafting.</dd>
                </dl>
              </div>
              <figure className="cand-fig">
                <svg className="pf" viewBox="0 0 240 160" role="img" aria-label="Contour map of an implied volatility surface with two sublevel-set basins shaded">
                  <rect className="ln" x="26" y="16" width="202" height="114" />
                  <ellipse className="ln" cx="116" cy="84" rx="82" ry="36" />
                  <ellipse className="ln" cx="116" cy="84" rx="60" ry="26" />
                  <ellipse className="acf" cx="116" cy="84" rx="38" ry="16" />
                  <ellipse className="acf" cx="116" cy="84" rx="17" ry="7" />
                  <ellipse className="ln" cx="190" cy="38" rx="24" ry="12" />
                  <ellipse className="acf" cx="190" cy="38" rx="11" ry="5.5" />
                  <text className="lab" x="228" y="146" textAnchor="end">strike</text>
                  <text className="lab" x="26" y="11">expiry</text>
                  <path className="ld" d="M40 144 L50 106" />
                  <text className="ref" x="30" y="154">810</text>
                  <path className="ld" d="M212 72 L196 44" />
                  <text className="ref" x="204" y="82">812</text>
                </svg>
                <figcaption><b>FIG. 8</b> Contours of the strike × expiry IV surface (810); the sublevel set (812) splits into two basins.</figcaption>
              </figure>
            </Spot>
          </div>
        </div>
      </Reveal>
    </>
  );
}
