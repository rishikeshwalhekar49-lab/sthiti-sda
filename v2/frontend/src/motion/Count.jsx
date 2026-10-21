// React Bits' CountUp for live figures: counts up the first time a number arrives, then rolls
// to each new value. The formatter is the site's own, so the settled text is exactly the
// original's. If animation cannot run (reduced motion, or a clock that never starts), the
// exact figure is shown as plain text: a count-up must never leave a wrong number on screen.
import { useState } from 'react';
import CountUp from './reactbits/CountUp.jsx';
import { useMotion } from './MotionProvider.jsx';

export default function Count({ value, format }) {
  const { settled } = useMotion();
  const [from] = useState(() => value * 0.82);
  if (settled) return <span style={{ fontVariantNumeric: 'tabular-nums' }}><span>{format(value)}</span></span>;
  return <CountUp from={from} to={value} duration={0.9} formatter={format} trigger="view" />;
}
