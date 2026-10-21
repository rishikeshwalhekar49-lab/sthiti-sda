// The twelve lessons (original renderCurriculum / renderProgress), as React.
import { useState } from 'react';
import CURRICULUM from '../data/curriculum.js';
import { useLearn } from '../state/LearnContext.jsx';
import { Details } from './controls.jsx';

function Quiz({ m }) {
  const [chosen, setChosen] = useState({});   // question index -> option index
  return (
    <div className="check" data-module={m.id}><span className="mono-label">Check yourself</span>
      {m.quiz.map((q, qi) => {
        const c = chosen[qi], answered = c != null, ok = c === q.a;
        return (
          <div className="check-item" data-q={qi} key={qi} data-answered={answered ? '1' : undefined}>
            <p className="check-q">{q.q}</p>
            <div className="quiz-opts">{q.opts.map((o, oi) => {
              const right = answered && oi === q.a, wrong = answered && oi === c && !right;
              return (
                <button type="button" key={oi} className={'opt' + (right ? ' right' : wrong ? ' wrong' : '')} data-opt={oi} disabled={answered}
                  onClick={() => { if (!answered) setChosen((s) => ({ ...s, [qi]: oi })); }}>
                  {right ? '✓ ' + o : wrong ? '✕ ' + o : o}
                </button>
              );
            })}</div>
            <p className="check-why" aria-live="polite">{answered ? <><b>{ok ? 'Correct.' : 'Not quite.'}</b> {q.why}</> : null}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Curriculum() {
  const { done, toggle } = useLearn();
  let n = 0;
  return CURRICULUM.map((st) => {
    const count = st.modules.filter((m) => done[m.id]).length;
    return [
      <div className="stage-head" id={'stage' + st.stage} key={'h' + st.stage}><h2>Stage {st.stage} · {st.name}</h2>
        <span className="meta">{count} of {st.modules.length} done · about {st.mins} minutes</span></div>,
      <p className="stage-blurb" key={'b' + st.stage}>{st.blurb}</p>,
      ...st.modules.map((m) => {
        n++;
        return (
          <Details className={'les' + (done[m.id] ? ' done' : '')} id={'l-' + m.id} key={m.id}>
            <summary><span className="num">{n}</span>
              <span><span className="ttl">{m.title}</span><span className="can">{m.can}</span></span>
              <span className="tag" data-mins={m.mins}>{done[m.id] ? '✓ done' : m.mins + ' min'}</span></summary>
            <div className="les-body">
              {m.body.map((p, i) => <p key={i}>{p}</p>)}
              <div className="terms">{m.terms.map((t, i) => <span className="term" key={i}><b>{t[0]}</b><span>{t[1]}</span></span>)}</div>
              <Quiz m={m} />
              <div className="les-foot">
                <a className="btn btn-ghost btn-sm practise" href={m.practise.href}>{m.practise.label} →</a>
                <button type="button" className="chipbtn mark" data-module={m.id} onClick={() => toggle(m.id)}>{done[m.id] ? 'Done ✓' : 'Mark as done'}</button>
              </div>
            </div>
          </Details>
        );
      }),
    ];
  });
}
