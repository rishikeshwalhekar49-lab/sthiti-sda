// React Bits' SpotlightCard, set up to reproduce Sthiti's original card light: a soft wash of
// the accent colour that follows the pointer over the hovered card only, with the card's
// own styling left untouched.
import SpotlightCard from './reactbits/SpotlightCard.jsx';
import './reactbits/SpotlightCard.css';

export default function Spot({ as = 'a', children, ...rest }) {
  return (
    <SpotlightCard as={as} bare theme="dark" spotlightColor="var(--h0)" intensity={0.1} spotlightSize={240}
      softness={0.7} borderGlow={0} proximity={0} flare={false} {...rest}>
      {children}
    </SpotlightCard>
  );
}
