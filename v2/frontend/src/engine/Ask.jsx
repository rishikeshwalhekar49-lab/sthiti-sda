// Ask the engine (original renderAskSuggestions / askEngine). The backend now answers through
// any configured language model (llm.py), so the badge names whichever one wrote the answer.
import { useState } from 'react';
import { useData } from '../state/DataContext.jsx';
import { postJson } from '../lib/api.js';
import { Src, boldMarkdown } from '../components/common.jsx';
import Reveal from '../motion/Reveal.jsx';

const ASK_SUGGESTIONS = [
  'Why is the market in this regime today?',
  'Which sectors have decoupled in the last month?',
  'What would have to change for the engine to read stress?',
  'Is diversification working right now?',
];
const LLM_NAME = { claude: 'Claude', groq: 'Groq', gemini: 'Gemini', deepseek: 'DeepSeek', openrouter: 'OpenRouter' };

function Answer({ a }) {
  // Claude keeps the original wording; another provider is named with its model
  const by = a.llmProvider === 'claude' ? 'Claude' : (LLM_NAME[a.llmProvider] || a.llmProvider) + (a.llmModel ? ' (' + a.llmModel + ')' : '');
  return <>
    {a.llm ? <div><span className="ask-badge">{'Answer · written by ' + by + ' from the engine’s numbers'}</span>{a.llm.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div> : null}
    <div style={{ marginTop: a.llm ? '18px' : '0' }}><span className="ask-badge">{a.llm ? 'The underlying read' : 'Answer · from the engine’s numbers'}</span>{a.plain.split(/\n\n+/).map((p, i) => <p key={i}>{boldMarkdown(p)}</p>)}</div>
    {!a.llmAvailable ? <p className="hint">Set <code>ANTHROPIC_API_KEY</code> (or <code>GROQ_API_KEY</code>, <code>GEMINI_API_KEY</code>, <code>DEEPSEEK_API_KEY</code> or <code>OPENROUTER_API_KEY</code>) on the server to have a language model answer free-form questions here; the read above is written from the same numbers either way.</p> : null}
    {a.llmError ? <p className="hint">{(a.llm ? 'Answered by ' + by + ' after: ' : 'No language model could be reached: ') + a.llmError}</p> : null}
  </>;
}

export default function Ask() {
  const { eod } = useData();
  const [q, setQ] = useState('');
  const [out, setOut] = useState(null);
  const [src, setSrc] = useState(null);
  const ask = (question) => {
    setOut(<p className="note">Reading the engine…</p>);
    postJson('/api/explain', { question }).then((a) => {
      if (a.error) { setOut(<p className="note warn">{a.error}</p>); return; }
      setOut(<Answer a={a} />);
      const first = a.llmProviders && a.llmProviders[0];
      const name = LLM_NAME[a.llmProvider || (first && first.name)] || 'Claude';
      setSrc(a.llmAvailable ? 'engine facts + ' + name : 'engine facts');
    }).catch((e) => setOut(<p className="note warn">{String(e.message || e)}</p>));
  };
  const pick = (s) => { setQ(s); ask(s); };
  return (
    // markup: public/index.html #ask (filled by v2/tools/fill_markup.py)
    <>
      <Reveal className="wrap sec" id="ask" as="section">
        <div className="sec-label mono-label">Ask the engine</div>
        <div>
          <h2>Ask why, in plain English</h2>
          <p className="intro">The engine's raw output is a barcode and a cycle. This turns it into a sentence: ask a question and it answers from the numbers on this page, naming the sectors involved.</p>
          <div className="panel">
            <div className="panel-bar">
              <span className="mono-label">Question</span>
              <Src id="askSrc" text={src} />
            </div>
            <div className="ask-form">
              <input type="search" id="askQ" placeholder="Why is the market in this regime today?" aria-label="Ask the engine a question" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(q || ASK_SUGGESTIONS[0]); }} />
              <button type="button" className="btn btn-primary btn-sm" id="askGo" onClick={() => ask(q || ASK_SUGGESTIONS[0])}>Ask</button>
            </div>
            <div className="ask-suggest" id="askSuggest">{eod ? ASK_SUGGESTIONS.map((s) => <button key={s} type="button" className="chipbtn" data-q={s} onClick={() => pick(s)}>{s}</button>) : null}</div>
            <div className="ask-out" id="askOut" aria-live="polite">{out ?? <><p className="note">Ask a question, or pick one above.</p></>}</div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
