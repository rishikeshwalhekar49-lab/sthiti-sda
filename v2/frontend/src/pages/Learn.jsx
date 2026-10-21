// Learn page: the original markup, with progress, stage cards and lessons rendered by React.
import { useLearn } from '../state/LearnContext.jsx';
import StageCards from '../components/StageCards.jsx';
import Curriculum from '../components/Curriculum.jsx';
import { Details } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

export default function Learn() {
  const learn = useLearn();
  return (
    // markup: public/index.html page:learn (filled by v2/tools/fill_markup.py)
    <>
      <section className="wrap phead">
        <div className="eyebrow mono-label">
          <span>Learn</span>
          <span>Beginner to advanced</span>
        </div>
        <h1>Learn the market, one step at a time</h1>
        <p className="intro">Twelve lessons in three stages. Stage 1 assumes you have never bought a share. Each lesson is a few minutes of reading, two questions to check yourself, and one tool on this site to try it on. The lessons never change; the market data they point you at does.</p>
        <div className="learn-top">
          <div className="progress-card">
            <span className="mono-label">Your progress</span>
            <div className="big-num" id="lpDone">{learn.doneCount}<small>of {learn.total} lessons</small></div>
            <div className="xp-bar" aria-hidden="true">
              <span id="lpFill" style={{ width: (learn.doneCount / learn.total * 100) + '%' }} />
            </div>
            <div className="trade-row">
              <a className="btn btn-primary btn-sm" id="lpContinue" href={'#learn/l-' + learn.next.id}>{learn.continueLabel} <span aria-hidden="true">→</span></a>
              <button type="button" className="chipbtn" id="lpReset" onClick={learn.reset}>Reset</button>
            </div>
            <p className="hint">Progress is kept in this browser only.</p>
          </div>
          <Reveal className="stage-cards" id="stageCards" stagger={0.07}><StageCards /></Reveal>
        </div>
      </section>
      <section className="wrap" id="curriculum"><Curriculum /></section>
      <Reveal className="wrap sec" id="bridge" as="section">
        <div className="sec-label mono-label">Bridge</div>
        <div>
          <h2>From course concept to live statistic</h2>
          <p className="intro">Instead of teaching each concept in isolation, every module links to the market data it describes, and to a feature that puts it to work.</p>
          <div className="bridge-wrap">
            <table className="bridge">
              <thead>
                <tr>
                  <th scope="col">Course concept</th>
                  <th scope="col">Statistic needed</th>
                  <th scope="col">Applied-learning feature</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Fundamental valuation</th>
                  <td>Live P/E, market cap, debt, profit growth, EPS</td>
                  <td><a href="#tools/t-screen">Stock health scorecard</a>. Breaks down a live stock's fundamentals and explains why its P/E is high or low, using the lesson's criteria.</td>
                </tr>
                <tr>
                  <th scope="row">Technical indicators</th>
                  <td>Live RSI, MACD, moving-average overlays</td>
                  <td><a href="#tools/t-chart">Interactive chart annotations</a>. After the RSI lesson, highlights stocks crossing overbought or oversold levels right now.</td>
                </tr>
                <tr>
                  <th scope="row">Market sentiment</th>
                  <td>Advance/decline ratio, FII/DII activity, India VIX</td>
                  <td><a href="#tools/t-mood">Market mood meter</a>. A live gauge that explains institutional buying and selling in plain English, drawing on the psychology module.</td>
                </tr>
                <tr>
                  <th scope="row">Risk management</th>
                  <td>Beta, volatility (standard deviation), ATR</td>
                  <td><a href="#tools/t-position">Smart stop-loss &amp; position calculator</a>. Enter total capital and get a safe position size from the stock's live volatility.</td>
                </tr>
                <tr>
                  <th scope="row">Derivatives / options</th>
                  <td>Live option chain, open-interest buildup, max pain</td>
                  <td><a href="#tools/t-options">Visual option strategy simulator</a>. Turns option-chain math into a payoff graph for bullish and bearish strategies.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
      <Reveal className="wrap sec" id="pillars" as="section">
        <div className="sec-label mono-label">Reference</div>
        <div>
          <h2>The five pillars, as courses teach them</h2>
          <p className="intro">The twelve lessons above are the path through this material. Below is the same ground grouped the way paid academies and free platforms organise it, with the live tool for each.</p>
          <Details className="how" style={{ marginTop: "18px" }}>
            <summary>Open the five-pillar syllabus</summary>
            <div className="wrap-inner">
              <div className="pillars">
                <article className="pillar" id="p-fund">
                  <div>
                    <span className="mono-label">Pillar</span>
                    <h2>Fundamental analysis</h2>
                  </div>
                  <div>
                    <p className="pillar-sum">How to judge a company's financial health from its balance sheet, profit-and-loss statement and key ratios.</p>
                    <ul className="topics">
                      <li>Balance sheet</li>
                      <li>P&amp;L statement</li>
                      <li>P/E ratio</li>
                      <li>ROE</li>
                      <li>Debt-to-equity</li>
                      <li>EPS</li>
                    </ul>
                    <p className="regime-note"><span className="mono-label">Regime note</span>In a stress regime stocks move together, so a company's own numbers explain less of each day's move. Fundamentals matter more again once sectors separate.</p>
                  </div>
                  <div>
                    <a className="pillar-live" href="#tools/t-screen">
                      <span className="mono-label">Practise it live</span>
                      <b>Stock health scorecard</b>
                      <span>Live P/E, market cap, debt, profit growth and EPS</span>
                    </a>
                    <a className="pillar-also" href="#tools/t-screen">Also: learn-as-you-screen</a>
                  </div>
                </article>
                <article className="pillar" id="p-tech">
                  <div>
                    <span className="mono-label">Pillar</span>
                    <h2>Technical analysis &amp; price action</h2>
                  </div>
                  <div>
                    <p className="pillar-sum">Reading candlestick charts, spotting patterns, and using indicators to judge momentum and trend.</p>
                    <ul className="topics">
                      <li>Candlesticks</li>
                      <li>Head &amp; shoulders</li>
                      <li>Triangles</li>
                      <li>RSI</li>
                      <li>MACD</li>
                      <li>Moving averages</li>
                      <li>VWAP</li>
                    </ul>
                    <p className="regime-note"><span className="mono-label">Regime note</span>Oscillators like RSI suit range-bound markets. In a strong trend RSI can sit above 70 for weeks. The regime tells you which reading to trust.</p>
                  </div>
                  <div>
                    <a className="pillar-live" href="#tools/t-chart">
                      <span className="mono-label">Practise it live</span>
                      <b>Interactive chart annotations</b>
                      <span>Live RSI, MACD and moving-average overlays</span>
                    </a>
                    <a className="pillar-also" href="#tools/t-scanner">Also: pattern &amp; breakout scanner</a>
                  </div>
                </article>
                <article className="pillar" id="p-deriv">
                  <div>
                    <span className="mono-label">Pillar</span>
                    <h2>Derivatives &amp; advanced strategies</h2>
                  </div>
                  <div>
                    <p className="pillar-sum">Futures and options, reading an option chain, implied volatility, hedging, and the ideas behind algorithmic trading.</p>
                    <ul className="topics">
                      <li>Futures</li>
                      <li>Options (F&amp;O)</li>
                      <li>Option chain</li>
                      <li>Implied volatility</li>
                      <li>Hedging</li>
                      <li>Algo trading</li>
                    </ul>
                    <p className="regime-note"><span className="mono-label">Regime note</span>Implied volatility and India VIX rise as the market moves toward stress, so the same option costs more. Patent candidate 7 tests whether the IV surface changes shape before the cash market does.</p>
                  </div>
                  <div>
                    <a className="pillar-live" href="#tools/t-options">
                      <span className="mono-label">Practise it live</span>
                      <b>Option strategy simulator</b>
                      <span>Live option chain, OI buildup and max pain</span>
                    </a>
                  </div>
                </article>
                <article className="pillar" id="p-risk">
                  <div>
                    <span className="mono-label">Pillar</span>
                    <h2>Risk management &amp; portfolio building</h2>
                  </div>
                  <div>
                    <p className="pillar-sum">Sizing positions, placing stop-losses, weighing risk against reward, allocating across assets, and the tax that follows.</p>
                    <ul className="topics">
                      <li>Position sizing</li>
                      <li>Stop-loss</li>
                      <li>Risk-to-reward</li>
                      <li>Asset allocation</li>
                      <li>Tax implications</li>
                    </ul>
                    <p className="regime-note"><span className="mono-label">Regime note</span>Volatility-based stops widen when ATR expands, so the same rupee risk buys fewer shares. The calculator does this for you.</p>
                  </div>
                  <div>
                    <a className="pillar-live" href="#tools/t-position">
                      <span className="mono-label">Practise it live</span>
                      <b>Stop-loss &amp; position calculator</b>
                      <span>Live beta, standard deviation and ATR</span>
                    </a>
                  </div>
                </article>
                <article className="pillar" id="p-psych">
                  <div>
                    <span className="mono-label">Pillar</span>
                    <h2>Trading psychology &amp; discipline</h2>
                  </div>
                  <div>
                    <p className="pillar-sum">Managing fear of missing out, resisting panic selling, and sticking to a trade plan.</p>
                    <ul className="topics">
                      <li>FOMO</li>
                      <li>Panic selling</li>
                      <li>Trade plans</li>
                      <li>Discipline</li>
                    </ul>
                    <p className="regime-note"><span className="mono-label">Regime note</span>FOMO tends to peak late in rallies and panic selling in stress. The mood meter names the feeling before you act on it.</p>
                  </div>
                  <div>
                    <a className="pillar-live" href="#tools/t-mood">
                      <span className="mono-label">Practise it live</span>
                      <b>Market mood meter</b>
                      <span>Advance/decline, FII/DII activity and India VIX</span>
                    </a>
                    <a className="pillar-also" href="#tools/t-paper">Also: post-trade diagnostics</a>
                  </div>
                </article>
              </div>
            </div>
          </Details>
        </div>
      </Reveal>
    </>
  );
}
