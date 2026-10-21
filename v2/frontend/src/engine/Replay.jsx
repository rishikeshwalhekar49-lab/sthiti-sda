// Crash replay (original EPISODES / loadEpisode): loads a stress episode from NSE's index
// archive into FIG. 1.
import { useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { useEngine } from '../state/EngineContext.jsx';
import { useMotion } from '../motion/MotionProvider.jsx';
import { fmtDate } from '../lib/format.js';
import { getJson } from '../lib/api.js';
import { Src } from '../components/common.jsx';
import { ChipOption } from '../components/chips.jsx';
import Reveal from '../motion/Reveal.jsx';

const EPISODES = {
  '2020': { from: '2019-11-01', to: '2020-05-29', label: 'COVID crash · Feb–May 2020' },
  '2018': { from: '2018-05-01', to: '2018-11-30', label: 'IL&FS credit squeeze · 2018' },
  '2013': { from: '2013-02-01', to: '2013-09-30', label: 'Taper tantrum · 2013' },
};

export default function Replay() {
  const { eod } = useData();
  const { buildFrom, buildLive, stopPlay } = useEngine();
  const { scrollTo } = useMotion();
  const [ep, setEp] = useState('live');
  const [note, setNote] = useState(null);
  const [src, setSrc] = useState(null);
  const load = (key) => {
    setEp(key);
    if (key === 'live') {
      if (!eod) return;
      stopPlay(); buildLive();
      setNote('The figure is showing the last two years of NSE sector indices.');
      setSrc({ text: 'live history', live: true });
      return;
    }
    const e = EPISODES[key];
    setNote('Downloading ' + e.label + ' from NSE’s index archive…');
    setSrc({ text: 'loading…', live: false });
    getJson('/api/episode?from=' + e.from + '&to=' + e.to).then((r) => {
      const d = r.body;
      if (d.error) { setNote(d.error); return; }
      stopPlay();
      buildFrom(d.dates, d.sectors, e.label, false);
      setNote(<>Replaying <b>{e.label}</b>{': ' + d.dates.length + ' sessions, ' + d.sectors.length + ' sector indices that existed then. Drag the window slider on FIG. 1, or press Play year, and watch the barcode collapse as the crash arrives.'}</>);
      setSrc({ text: 'NSE index archive · ' + fmtDate(d.from) + ' to ' + fmtDate(d.to), live: false });
      const fig1 = document.getElementById('fig1');
      if (fig1) scrollTo(fig1);
    }).catch((err) => setNote('Could not load that episode: ' + (err.message || err)));
  };
  return (
    // markup: public/index.html #replay (filled by v2/tools/fill_markup.py)
    <Reveal className="wrap sec" id="replay" as="section">
      <div className="sec-label mono-label">Crash replay</div>
      <div>
        <h2>Watch the structure warp before the price does</h2>
        <p className="intro">Load a historical stress episode and the figure above replays it: the same sector indices, the same filtration, day by day. Press play on the figure's window slider to animate it.</p>
        <div className="panel">
          <div className="panel-bar">
            <div className="scan-bar" role="group" aria-label="Episode">
              <ChipOption type="button" className="chipbtn" data-ep="live" aria-pressed="true" attr="data-ep" active={ep} onPick={load}>Last two years</ChipOption>
              <ChipOption type="button" className="chipbtn" data-ep="2020" attr="data-ep" active={ep} onPick={load}>COVID crash · 2020</ChipOption>
              <ChipOption type="button" className="chipbtn" data-ep="2018" attr="data-ep" active={ep} onPick={load}>IL&amp;FS squeeze · 2018</ChipOption>
              <ChipOption type="button" className="chipbtn" data-ep="2013" attr="data-ep" active={ep} onPick={load}>Taper tantrum · 2013</ChipOption>
            </div>
            <Src id="epSrc" text={src && src.text} live={!!src && src.live} />
          </div>
          <div className="ep-note" id="epNote">{note ?? <>The figure is showing the last two years of NSE sector indices. Pick an episode to replay it; NSE's index archive doesn't serve files old enough for 2008.</>}</div>
        </div>
      </div>
    </Reveal>
  );
}
