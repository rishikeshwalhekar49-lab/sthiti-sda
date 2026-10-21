// The status bar under the header (original renderStatus).
import { useData } from '../state/DataContext.jsx';
import { f, fmtDate, nIN, sPct } from '../lib/format.js';

export default function StatusBar() {
  const { live, eod, errors, eodProgress, marketOpen } = useData();
  const m = live && live.market, open = marketOpen();
  const ix = live && live.indices && live.indices['NIFTY 50'];
  const vix = live && live.indices && live.indices['INDIA VIX'];
  return (
    <div className="status-bar">
      <div className="wrap status-in" id="statusBar" aria-live="polite">
        <span><span className={'dot ' + (errors.length ? 'err' : open ? 'on' : 'off')} id="stDot" /><b id="stMarket">{m ? (open ? 'Market open' : 'Market closed') : 'Connecting…'}</b></span>
        <span id="stIndex">{ix ? <>NIFTY 50 <b>{nIN(ix.last, 2)}</b> <span className={ix.pct >= 0 ? 'pos' : 'neg'}>{sPct(ix.pct)}</span>{vix ? <> · India VIX <b>{f(vix.last, 2)}</b></> : ''} · {m && m.tradeDate ? m.tradeDate : ''}</> : ''}</span>
        <span id="stEod">{eod
          ? <>End-of-day history to <b>{fmtDate(eod.asOf)}</b> · {eod.dates.length} sessions</>
          : eodProgress ? <>Downloading a year of NSE end-of-day files… <b>{eodProgress.done}/{eodProgress.total}</b></> : 'Loading end-of-day files…'}</span>
        <span id="stErr" className="status-err">{errors.length ? errors.slice(0, 2).join(' · ') : ''}</span>
      </div>
    </div>
  );
}
