// Market mood model and gauge, unchanged from the original public/app.js; the gauge is
// now a React SVG component instead of an HTML string.
import { clamp, f, nIN } from './format.js';

export const ZONES = [{ max: 25, name: 'Fear', cls: 'g-z1' }, { max: 45, name: 'Cautious', cls: 'g-z2' }, { max: 55, name: 'Neutral', cls: 'g-z3' }, { max: 75, name: 'Optimistic', cls: 'g-z4' }, { max: 100.5, name: 'Euphoric', cls: 'g-z5' }];
export function zoneOf(s) { for (let i = 0; i < ZONES.length; i++) if (s < ZONES[i].max) return ZONES[i]; return ZONES[ZONES.length - 1]; }
export function moodModel(ad, fii, dii, vix) { const b = clamp(50 + 50 * Math.log(ad) / Math.log(3), 0, 100), fl = clamp(50 + 50 * (fii + dii) / 6000, 0, 100), v = clamp((30 - vix) / 20 * 100, 0, 100); return { b, f: fl, v, score: 0.35 * b + 0.30 * fl + 0.35 * v }; }

export function Gauge({ score, big }) {
  const cx = 100, cy = 100, r = 80, sw = big ? 16 : 18;
  const pt = (s, rr) => { const a = Math.PI * (1 - s / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
  let prev = 0;
  const arcs = ZONES.map((z) => {
    const hiZ = Math.min(100, z.max), p1 = pt(prev + 0.9, r), p2 = pt(hiZ - 0.9, r);
    prev = hiZ;
    return <path key={z.cls} className={z.cls} d={'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1)} fill="none" strokeWidth={sw} />;
  });
  const n = pt(clamp(score, 0, 100), r - 24);
  return (
    <svg viewBox={'0 0 200 ' + (big ? 124 : 106)} role="img" aria-label={'Mood gauge at ' + Math.round(score) + ' of 100'}>
      {arcs}
      <line className="g-needle" x1={cx} y1={cy} x2={n[0].toFixed(1)} y2={n[1].toFixed(1)} />
      <circle className="g-hub" cx={cx} cy={cy} r="5" />
      {big && <><text className="g-lab" x={cx - r} y={cy + 22} textAnchor="middle">Fear</text><text className="g-lab" x={cx + r} y={cy + 22} textAnchor="middle">Euphoria</text></>}
    </svg>
  );
}

export const PSY = {
  Fear: ['This is when panic selling is most tempting. Stick to the stops you set before the day began.', '#learn/p-psych', 'Lesson: panic selling'],
  Cautious: ['Size positions down while breadth is weak, and don’t widen stops to avoid being wrong.', '#tools/t-position', 'Lesson: sizing when breadth weakens'],
  Neutral: ['No strong emotion in the market. A good day to follow the plan rather than the headlines.', '#learn/p-psych', 'Lesson: sticking to a trade plan'],
  Optimistic: ['Momentum is with buyers. Check you’re buying setups, not just rising prices.', '#tools/t-scanner', 'Lesson: confirming a breakout'],
  Euphoric: ['FOMO peaks here. Chasing late entries is the classic mistake in euphoric markets.', '#learn/p-psych', 'Lesson: FOMO'],
};

export function MoodText({ ad, fii, dii, vix, z }) {
  const F = nIN(Math.abs(fii)), D = nIN(Math.abs(dii));
  let p1;
  if (fii < 0 && dii > 0) { const share = dii / Math.abs(fii); p1 = 'Foreign institutions (FIIs) sold ₹' + F + ' crore while domestic institutions (DIIs) bought ₹' + D + ' crore. ' + (share >= 1 ? 'Domestic funds absorbed all of the foreign selling.' : 'Domestic funds absorbed about ' + Math.round(share * 100) + '% of it; retail and other traders bought the remaining ₹' + nIN(Math.abs(fii) - dii) + ' crore.'); }
  else if (fii >= 0 && dii >= 0) p1 = 'Both FIIs (₹' + F + ' crore) and DIIs (₹' + D + ' crore) were net buyers: broad institutional support.';
  else if (fii < 0 && dii < 0) p1 = 'Both FIIs (₹' + F + ' crore) and DIIs (₹' + D + ' crore) were net sellers. When institutions step back together, retail traders are the ones buying.';
  else p1 = 'FIIs bought ₹' + F + ' crore while DIIs sold ₹' + D + ' crore, which can mean domestic funds are booking profits into foreign demand.';
  const p2 = (ad >= 1 ? 'Breadth is positive: ' + f(ad, 2) + ' stocks rose for every one that fell in the NIFTY 500. ' : 'Breadth is weak: only ' + f(ad, 2) + ' stocks rose for every one that fell in the NIFTY 500, so most of the market slipped even if the index held up. ') +
    (vix < 13 ? 'India VIX at ' + f(vix, 1) + ' is low: traders expect calm, and complacency can creep in.' : vix < 20 ? 'India VIX at ' + f(vix, 1) + ' is moderate.' : vix < 28 ? 'India VIX at ' + f(vix, 1) + ' is elevated: option buyers are paying up for protection.' : 'India VIX at ' + f(vix, 1) + ' is high: the market is pricing in big swings.');
  const ps = PSY[z.name];
  return <><p>{p1}</p><p>{p2}</p><p><b>Psychology:</b> {ps[0]} <a className="lesson-link" href={ps[1]}>{ps[2]} →</a></p></>;
}
