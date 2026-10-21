// The live index ticker above the hero: React Bits' LogoLoop carrying the original cells.
import { useMemo } from 'react';
import LogoLoop from '../motion/reactbits/LogoLoop.jsx';
import '../motion/reactbits/LogoLoop.css';
import { useData } from '../state/DataContext.jsx';

const ORDER = ['NIFTY 50', 'NIFTY BANK', 'NIFTY 500', 'INDIA VIX', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY PHARMA', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 'NIFTY ENERGY'];

function Cell({ name, q }) {
  const pct = typeof q.pct === 'number' ? q.pct : null;
  const val = typeof q.last === 'number' ? q.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const sign = pct === null ? '' : (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';
  return (
    <span className="mo-cell"><span className="mo-cell-n">{name}</span><span className="mo-cell-v">{val}</span>
      {sign && <span className={'mo-cell-p ' + (pct >= 0 ? 'pos' : 'neg')}>{sign}</span>}</span>
  );
}

export default function Ticker() {
  const { live } = useData();
  const items = useMemo(() => {
    const ix = live && live.indices;
    if (!ix) return null;
    const keys = ORDER.filter((k) => ix[k]);
    if (keys.length < 3) return null;
    return keys.map((k) => {
      const name = k.replace(/^NIFTY /, '');
      return { node: <Cell name={name} q={ix[k]} />, ariaLabel: name + ' ' + ix[k].last };
    });
  }, [live]);
  return (
    <div className="ticker-wrap" id="ticker" hidden={!items} aria-label="Live index ticker">
      {items && <LogoLoop logos={items} speed={42} hoverSpeed={42 * 0.15} gap={0} logoHeight={14} fadeOut={false} intro={false} ariaLabel="Live index ticker" />}
    </div>
  );
}
