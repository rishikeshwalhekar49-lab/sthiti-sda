// The three stage cards (original renderStageCards), each with React Bits' SpotlightCard light.
import CURRICULUM from '../data/curriculum.js';
import { useLearn } from '../state/LearnContext.jsx';
import Spot from '../motion/Spot.jsx';

export default function StageCards() {
  const { done } = useLearn();
  return CURRICULUM.map((st) => {
    const n = st.modules.filter((m) => done[m.id]).length;
    return (
      <Spot as="a" className="stage-card" href={'#learn/l-' + st.modules[0].id} key={st.stage}>
        <span className="meta">Stage {st.stage} · {st.mins} min</span>
        <b>{st.name}</b><p>{st.blurb}</p>
        <span className="meta">{n} of {st.modules.length} done</span>
        <span className="bar"><span style={{ width: (n / st.modules.length * 100) + '%' }} /></span>
      </Spot>
    );
  });
}
