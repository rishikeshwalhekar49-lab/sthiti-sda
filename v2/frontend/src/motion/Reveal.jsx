// Scroll reveals for page sections: React Bits' AnimatedContent with Sthiti's timings
// (18 px rise, 0.62 s, starting when the top passes 82% of the viewport, as before).
import { createContext, useContext } from 'react';
import AnimatedContent from './reactbits/AnimatedContent.jsx';

export const PageCtx = createContext({ entered: true });

export default function Reveal({ as = 'div', stagger = 0, children, ...rest }) {
  const { entered } = useContext(PageCtx);
  return (
    <AnimatedContent as={as} enabled={entered} distance={18} duration={0.62} ease="power3.out" threshold={0.18}
      initialOpacity={0} stagger={stagger} data-mo-reveal="" {...rest}>
      {children}
    </AnimatedContent>
  );
}
