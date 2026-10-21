// Home page. The markup is the original's (filled in by v2/tools/fill_markup.py); the
// parts public/app.js used to write by id are rendered here from live data.
import { useContext, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useData } from '../state/DataContext.jsx';
import { useEngine, REG } from '../state/EngineContext.jsx';
import { useLearn } from '../state/LearnContext.jsx';
import { clamp, f, nIN, sInr, sPct } from '../lib/format.js';
import { Gauge, moodModel, zoneOf } from '../lib/mood.jsx';
import { Src } from '../components/common.jsx';
import StageCards from '../components/StageCards.jsx';
import Ticker from '../components/Ticker.jsx';
import Reveal, { PageCtx } from '../motion/Reveal.jsx';
import Spot from '../motion/Spot.jsx';
import Count from '../motion/Count.jsx';
import SplitText from '../motion/reactbits/SplitText.jsx';
import { motionActive } from '../motion/MotionProvider.jsx';

const WEATHER = {
  calm: { icon: '☀︎', label: 'Clear skies', line: 'Sectors are moving apart and volatility is contained. Breakouts behave the way the course describes.' },
  trans: { icon: '☁︎', label: 'Choppy', line: 'Correlations are drifting up. Ranges hold better than breakouts, and stops belong closer.' },
  stress: { icon: '☈', label: 'Storm warning', line: 'Sectors are moving as one, so spreading money across them buys less protection than it looks like. Size down.' },
};

function Weather() {
  const { live } = useData();
  const { home } = useEngine();
  const w = home && WEATHER[home.key];
  const vix = live && live.indices ? live.indices['INDIA VIX'] : null;
  return (
    <Spot as="a" className={'weather' + (w ? ' ' + home.key : '')} id="weather" href="#engine">
      <span className="weather-icon" id="wIcon" aria-hidden="true">{w ? w.icon : '·'}</span>
      <span className="weather-body"><b id="wLabel">{w ? w.label : 'Reading the market…'}</b><span id="wLine">{w ? w.line + ' Mean sector correlation ' + f(home.rho, 2) + (vix ? ', India VIX ' + f(vix.last, 2) : '') + '.' : ''}</span></span>
      <span className="weather-go" aria-hidden="true">See the engine →</span>
    </Spot>
  );
}

/* the hero: heading words rise out of their masks (React Bits SplitText), then the rest.
   Like the original heroIn(), this plays the first time Home is shown, not while it is hidden. */
function HeroSection({ children, ...rest }) {
  const ref = useRef(null);
  const { entered } = useContext(PageCtx);
  useGSAP(() => {
    if (!motionActive || !entered) return;
    const items = ref.current.querySelectorAll('.eyebrow, .lede, .cta-row, .name-note, .state');
    gsap.fromTo(items, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.075, delay: 0.3, clearProps: 'opacity,transform' });
    const w = document.querySelector('.weather-wrap');   // sits above the hero, outside this scope
    if (w) gsap.from(w, { opacity: 0, y: -10, duration: 0.5, ease: 'power3.out', clearProps: 'opacity,transform' });
  }, { scope: ref, dependencies: [entered] });
  return <section ref={ref} data-mo-reveal="" {...rest}>{children}</section>;
}

function HeroHeading({ children }) {
  const { entered } = useContext(PageCtx);
  if (!entered) return <h1>{children}</h1>;
  return <SplitText tag="h1" text={children} splitType="words" mask textAlign="left"
    from={{ yPercent: 108 }} to={{ yPercent: 0 }} duration={0.78} delay={45} ease="power4.out" trigger="load" />;
}

export default function Home() {
  const d = useData();
  const { live, eod, marketOpen } = d;
  const { home, EG } = useEngine();
  const learn = useLearn();
  const open = marketOpen();
  const ix = live && live.indices && live.indices['NIFTY 50'];
  const vix = live && live.indices && live.indices['INDIA VIX'];
  const m = d.liveMood();
  const mm = m ? moodModel(m.ad, m.fii, m.dii, m.vix) : null;
  const sc = mm ? Math.round(mm.score) : null;
  const R = home ? REG[home.key] : null;

  let best = null;
  d.symbols().forEach((sym) => { const r = d.liveRsi(sym); if (r == null) return; if (!best || Math.abs(r - 50) > Math.abs(best.r - 50)) best = { sym, r }; });

  const bars = home ? home.h0Rows.slice(0, 5).map((b, i) => {
    const w = b.d === Infinity ? 92 : clamp(b.d / home.maxD * 92, 6, 92);
    return <rect key={i} x="0" y={4 + i * 9} width={w.toFixed(0)} height="4" rx="2" fill="var(--h0)" opacity={(1 - i * 0.14).toFixed(2)} />;
  }) : null;
  const loop = home && home.main ? <rect x={(home.main.b / home.maxD * 92).toFixed(0)} y="54" width={clamp((home.main.d - home.main.b) / home.maxD * 92, 4, 92).toFixed(0)} height="4" rx="2" fill="var(--h1)" /> : null;

  return (
    // markup: public/index.html page:home (filled by v2/tools/fill_markup.py)
    <>
      <Ticker />
      <section className="wrap weather-wrap">
        <Weather />
      </section>
      <HeroSection className="wrap hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow mono-label">
              <span>Stock-market learning</span>
              <span>Live NSE &amp; BSE data</span>
              <span>Regime detection</span>
            </div>
            <HeroHeading>Learn the market from the market itself.</HeroHeading>
            <p className="lede">Sthiti takes what paid and free stock-market courses teach and ties every lesson to a live market statistic, so a P/E or an RSI reading arrives with its meaning attached. Underneath, a regime engine reads the shape of the market and tells you which lessons apply today.</p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#tools">Try the tools <span aria-hidden="true">→</span></a>
              <a className="btn btn-ghost" href="#learn">What courses teach</a>
            </div>
            <p className="name-note"><span lang="hi">स्थिति</span> (sthiti) means “state” or “condition” in Hindi and Marathi. Here it's the state the market is in.</p>
          </div>
          <aside className="state" aria-label="Market state">
            <div className="state-head">
              <span className="mono-label">Market state</span>
              <Src id="hsSrc" text={live ? (open ? 'NSE · live' : 'NSE · ' + ((live.market && live.market.tradeDate) || 'last close')) : 'NSE · live'} live={live ? open : true} />
            </div>
            <div className="state-regime">
              <div>
                <span className="mono-label">Regime engine</span>
                <b id="hsRegime">{R ? R.name : '—'}</b>
                <p id="hsRegimeNote">{R ? R.note + ' Mean sector correlation ' + f(home.rho, 2) + '.' : 'Reading sector correlations…'}</p>
              </div>
              <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" id="hsBars">{bars}{loop}</svg>
            </div>
            <div className="state-mood">
              <div>
                <div className="gauge-mini" id="hsGauge">{mm && <Gauge score={mm.score} big={false} />}</div>
                <div className="gauge-caption">
                  <b id="hsScore" data-countup="">{mm ? <Count value={sc} format={(v) => String(Math.round(v))} /> : '—'}</b>
                  <span id="hsZone">{mm ? zoneOf(sc).name : ''}</span>
                </div>
              </div>
              <dl className="state-stats">
                <div>
                  <dt>NIFTY 50</dt>
                  <dd id="hsNifty" data-countup="">{ix ? <><Count value={ix.last} format={(v) => nIN(v, 2)} /> <span className={ix.pct >= 0 ? 'pos' : 'neg'} style={{ fontSize: '13px' }}>{sPct(ix.pct)}</span></> : '—'}</dd>
                </div>
                <div>
                  <dt>India VIX</dt>
                  <dd id="hsVIX" data-countup="">{vix ? <Count value={vix.last} format={(v) => f(v, 2)} /> : '—'}</dd>
                </div>
                <div>
                  <dt>Advance / decline</dt>
                  <dd id="hsAD" data-countup="">{m ? <Count value={m.ad} format={(v) => f(v, 2)} /> : '—'}</dd>
                </div>
                <div>
                  <dt>FII net</dt>
                  <dd id="hsFII" data-countup="">{m ? <span className={m.fii >= 0 ? 'pos' : 'neg'}><Count value={m.fii} format={(v) => sInr(v)} /> cr</span> : '—'}</dd>
                </div>
              </dl>
            </div>
            <a className="state-row" href={R ? R.href : '#tools/t-position'} id="hsLesson"><span className="mono-label">Lesson for this state</span>{R ? <>{R.surf.charAt(0).toUpperCase() + R.surf.slice(1)} <span aria-hidden="true">→</span></> : '—'}</a>
            <a className="state-row" href="#tools/t-chart" id="hsWatch"><span className="mono-label">On your watchlist</span>{best ? <><b>{best.sym}</b> · RSI {Math.round(best.r)}, {best.r > 70 ? 'overbought' : best.r < 30 ? 'oversold' : 'neutral'}. What that means <span aria-hidden="true">→</span></> : '—'}</a>
          </aside>
        </div>
      </HeroSection>
      <Reveal className="wrap sec" id="start-here" as="section">
        <div className="sec-label mono-label">New here</div>
        <div>
          <h2>Never bought a share? Start at the beginning</h2>
          <p className="intro">The tools on this site read a live market, which is a lot to take in at once. The learning path breaks it into twelve short lessons, and each one ends on the single tool it applies to.</p>
          <Reveal className="stage-cards" id="homeStages" stagger={0.07}><StageCards /></Reveal>
          <div className="cta-row">
            <a className="btn btn-primary" id="homeContinue" href={'#learn/l-' + learn.next.id}>{learn.continueLabel} <span aria-hidden="true">→</span></a>
            <a className="btn btn-ghost" href="#learn">See all twelve lessons</a>
          </div>
        </div>
      </Reveal>
      <Reveal className="wrap sec" as="section">
        <div className="sec-label mono-label">How it works</div>
        <div>
          <h2>Three layers on one screen</h2>
          <Reveal className="layers" stagger={0.07}>
            <Spot className="layer" href="#learn" as="a">
              <span className="mono-label">Learn</span>
              <b>The five pillars every course teaches</b>
              <p>Fundamentals, technicals, derivatives, risk and psychology, in short lessons.</p>
              <span className="go">See the syllabus →</span>
            </Spot>
            <Spot className="layer" href="#tools" as="a">
              <span className="mono-label">Apply</span>
              <b>Every lesson ends on a live number</b>
              <p>Scorecards, chart annotations, a mood meter, calculators and simulators reading NSE and BSE data.</p>
              <span className="go">Try the tools →</span>
            </Spot>
            <Spot className="layer" href="#engine" as="a">
              <span className="mono-label">Read the regime</span>
              <b>Know which lessons apply today</b>
              <p>A topological engine watches 18 NSE sector indices and spots when the market changes state.</p>
              <span className="go">See the engine →</span>
            </Spot>
          </Reveal>
        </div>
      </Reveal>
      <Reveal className="wrap sec" as="section">
        <div className="sec-label mono-label">Why</div>
        <div>
          <h2>Why course knowledge doesn't carry over to the screen</h2>
          <Reveal className="pairs" stagger={0.07}>
            <div className="pair">
              <div className="prob"><b>Concepts are taught in isolation</b>A lesson on P/E ends with a textbook example, not the stock in front of you.</div>
              <span className="arrow" aria-hidden="true">→</span>
              <div className="ans">Every lesson ends on a live statistic and a tool that uses it. <a href="#learn/bridge">The bridge table</a></div>
            </div>
            <div className="pair">
              <div className="prob"><b>Screeners overwhelm beginners</b>A P/E and a beta sit in a grid with no explanation.</div>
              <span className="arrow" aria-hidden="true">→</span>
              <div className="ans">Tap any number for a 30-second lesson about that stock, right now. <a href="#tools/t-screen">Learn-as-you-screen</a></div>
            </div>
            <div className="pair">
              <div className="prob"><b>Market shifts are explained after the fact</b>Research reads topological signals retrospectively, and a norm spike names no sectors.</div>
              <span className="arrow" aria-hidden="true">→</span>
              <div className="ans">The regime engine reads today's correlations and names the sectors behind the shape. <a href="#engine">Regime engine</a></div>
            </div>
            <div className="pair">
              <div className="prob"><b>The same mistakes repeat</b>Holding losers, cutting winners and revenge trading survive every course.</div>
              <span className="arrow" aria-hidden="true">→</span>
              <div className="ans">Post-trade diagnostics read your own paper trades and assign the module that fixes the habit. <a href="#tools/t-paper">Diagnostics</a></div>
            </div>
          </Reveal>
        </div>
      </Reveal>
      <Reveal className="wrap sec" as="section">
        <div className="sec-label mono-label">Features</div>
        <div>
          <h2>Ten features, each tied to a lesson</h2>
          <div className="feat-group">
            <h3 className="mono-label">Lesson → live data</h3>
            <Reveal className="feat-grid" stagger={0.07}>
              <Spot className="feat" href="#tools/t-screen" as="a">
                <span className="mono-label">Fundamentals</span>
                <b>Stock health scorecard</b>
                <p>Live P/E, ROE, margins and market cap, checked against the lesson's criteria.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-chart" as="a">
                <span className="mono-label">Technicals</span>
                <b>Chart annotations</b>
                <p>Every RSI threshold crossing marked on a real price series.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-mood" as="a">
                <span className="mono-label">Sentiment</span>
                <b>Market mood meter</b>
                <p>Today's FII/DII flows, breadth and India VIX in plain English.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-position" as="a">
                <span className="mono-label">Risk</span>
                <b>Stop-loss &amp; position calculator</b>
                <p>Position size from your capital and the stock's live ATR.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-options" as="a">
                <span className="mono-label">Derivatives</span>
                <b>Option strategy simulator</b>
                <p>The live NIFTY option chain as a payoff graph.</p>
              </Spot>
            </Reveal>
          </div>
          <div className="feat-group">
            <h3 className="mono-label">Topology tools</h3>
            <Reveal className="feat-grid four" stagger={0.07}>
              <Spot className="feat" href="#tools/t-topo" as="a">
                <span className="mono-label">Screening</span>
                <b>Topo-Screen</b>
                <p>Stocks ranked by how far they sit from the market's correlation cluster.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-backtest" as="a">
                <span className="mono-label">Proof</span>
                <b>Regime backtester</b>
                <p>Your strategy, with the wrong regimes filtered out.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-portfolio" as="a">
                <span className="mono-label">Institutional</span>
                <b>Portfolio fragility</b>
                <p>Hidden concentration in a basket that looks diversified.</p>
              </Spot>
              <Spot className="feat" href="#engine/replay" as="a">
                <span className="mono-label">Evidence</span>
                <b>Crash replay</b>
                <p>Watch 2020 and 2018 warp the structure, day by day.</p>
              </Spot>
            </Reveal>
          </div>
          <div className="feat-group">
            <h3 className="mono-label">Platform</h3>
            <Reveal className="feat-grid" stagger={0.07}>
              <Spot className="feat" href="#tools/t-screen" as="a">
                <span className="mono-label">Tooltips</span>
                <b>Learn-as-you-screen</b>
                <p>A 30-second lesson next to every live metric.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-paper" as="a">
                <span className="mono-label">Practice</span>
                <b>Paper trading</b>
                <p>Virtual money on a live price feed, with post-trade diagnostics.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-scanner" as="a">
                <span className="mono-label">Scanning</span>
                <b>Pattern &amp; breakout scanner</b>
                <p>The NIFTY 500 screened for the patterns taught in the course.</p>
              </Spot>
              <Spot className="feat" href="#tools/t-chart" as="a">
                <span className="mono-label">Progress</span>
                <b>Quizzes on real data</b>
                <p>Questions built from today's market, with XP.</p>
              </Spot>
              <Spot className="feat" href="#engine/ask" as="a">
                <span className="mono-label">Plain English</span>
                <b>Ask the engine</b>
                <p>Type a question, get the topology explained in a sentence.</p>
              </Spot>
            </Reveal>
          </div>
        </div>
      </Reveal>
      <Reveal className="wrap sec" as="section">
        <div className="sec-label mono-label">Under the hood</div>
        <div>
          <h2>A regime engine built on topology</h2>
          <div className="teaser">
            <div>
              <p className="intro" style={{ marginTop: "0" }}>The same RSI reading means different things in a calm market and a falling one. The regime engine applies persistent homology to the correlation structure of NSE sector indices and tells learners which state they're in.</p>
              <div className="cta-row">
                <a className="btn btn-primary btn-sm" href="#engine">Explore the engine</a>
              </div>
            </div>
            <ul className="facts">
              <li>
                <b>7</b>
                <span>patent candidates, from a streaming persistence engine to IV-surface topology</span>
              </li>
              <li>
                <b>8</b>
                <span>gaps in the research, each with a candidate aimed at it</span>
              </li>
              <li>
                <b id="hsSectors">{EG ? EG.codes.length : 18}</b>
                <span>NSE sector indices watched, over <span id="hsDays">{eod ? eod.dates.length : 260}</span> trading days</span>
              </li>
            </ul>
          </div>
        </div>
      </Reveal>
    </>
  );
}
