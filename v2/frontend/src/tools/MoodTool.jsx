// Market mood meter (original renderMood): today's readings only, nothing to adjust.
import { useRef } from 'react';
import { useData } from '../state/DataContext.jsx';
import { f, sInr } from '../lib/format.js';
import { Gauge, MoodText, moodModel, zoneOf } from '../lib/mood.jsx';
import { Src } from '../components/common.jsx';
import { Details } from '../components/controls.jsx';
import Reveal from '../motion/Reveal.jsx';

export default function MoodTool() {
  const d = useData();
  const last = useRef(null);
  const lm = d.liveMood();
  if (lm) last.current = lm;          // the original kept the last good reading
  const m = last.current;
  const model = m ? moodModel(m.ad, m.fii, m.dii, m.vix) : null;
  const sc = model ? Math.round(model.score) : null, z = model ? zoneOf(sc) : null;
  const open = d.marketOpen(), live = d.live;
  const src = live ? 'NSE breadth and India VIX ' + (open ? 'live' : 'at close') + (live.flows && live.flows.fii ? ' · FII/DII ' + live.flows.fii.date : '') : null;
  const comp = (v) => (model ? { width: v + '%' } : undefined);
  return (
    // markup: public/index.html #t-mood+decorate (filled by v2/tools/fill_markup.py)
    <Reveal className="tool" id="t-mood" as="section" stagger={0.08}>
      <div className="tool-head">
        <div><span className="mono-label">Market mood meter</span>{" "}<span className="level-badge">Stage 1</span><h2>What today's institutional buying and selling means</h2></div>
        <dl className="tool-meta">
          <dt>Pillar</dt>
          <dd>
            <a href="#learn/p-psych">Trading psychology</a>
          </dd>
          <dt>Statistics</dt>
          <dd>Advance/decline, FII/DII net flows, India VIX</dd>
        </dl>
      </div>
      <p className="tool-plain"><b>In plain words:</b> What the whole market did today, in one reading. <a href="#learn/l-b4" className="practise">Read the lesson first →</a></p>
      <p className="tool-intro">The gauge combines breadth, institutional flows and volatility into one reading, then explains it in plain English. It reports today's market and nothing else — there is nothing here to adjust.</p>
      <div className="panel">
        <div className="panel-bar">
          <span className="mono-label">Today's session</span>
          <Src id="moodSrc" text={src} live={live && open} />
        </div>
        <div className="mood">
          <div className="mood-left">
            <div className="gauge-big" id="moodGauge">{model && <Gauge score={model.score} big />}</div>
            <div className="mood-score">
              <b id="moodScore">{model ? sc : '—'}</b>
              <span id="moodZone">{model ? z.name : ''}</span>
            </div>
            <div className="mood-text" id="moodText" aria-live="polite">{model && <MoodText ad={m.ad} fii={m.fii} dii={m.dii} vix={m.vix} z={z} />}</div>
          </div>
          <div className="mood-right">
            <span className="mono-label">Today's readings</span>
            <dl className="fixed-readings">
              <div>
                <dt>Advance / decline (NIFTY 500)</dt>
                <dd id="mADo">{m ? f(m.ad, 2) : '—'}</dd>
              </div>
              <div>
                <dt>FII net</dt>
                <dd id="mFIIo">{m ? <span className={m.fii >= 0 ? 'pos' : 'neg'}>{sInr(m.fii)} cr</span> : '—'}</dd>
              </div>
              <div>
                <dt>DII net</dt>
                <dd id="mDIIo">{m ? <span className={m.dii >= 0 ? 'pos' : 'neg'}>{sInr(m.dii)} cr</span> : '—'}</dd>
              </div>
              <div>
                <dt>India VIX</dt>
                <dd id="mVIXo">{m ? f(m.vix, 2) : '—'}</dd>
              </div>
            </dl>
            <div>
              <span className="mono-label">Components, 0–100</span>
              <div className="comps">
                <div className="comp">
                  <span>Breadth</span>
                  <div className="comp-track">
                    <span id="cB" style={comp(model && model.b)} />
                  </div>
                  <output id="cBo">{model ? Math.round(model.b) : '—'}</output>
                </div>
                <div className="comp">
                  <span>Flows</span>
                  <div className="comp-track">
                    <span id="cF" style={comp(model && model.f)} />
                  </div>
                  <output id="cFo">{model ? Math.round(model.f) : '—'}</output>
                </div>
                <div className="comp">
                  <span>Volatility</span>
                  <div className="comp-track">
                    <span id="cV" style={comp(model && model.v)} />
                  </div>
                  <output id="cVo">{model ? Math.round(model.v) : '—'}</output>
                </div>
              </div>
            </div>
            <Details className="how">
              <summary>How the score is built</summary>
              <p>Breadth scores 50 at an advance/decline ratio of 1, 100 at 3 and 0 at ⅓ (log scale). Flows score 50 at zero combined FII + DII flow, ±50 at ±₹6,000 crore. Volatility scores 100 at a VIX of 10 and 0 at 30. The mood is 35% breadth, 30% flows and 35% volatility. These weights are Sthiti's own starting point for testing, not a published standard.</p>
            </Details>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
