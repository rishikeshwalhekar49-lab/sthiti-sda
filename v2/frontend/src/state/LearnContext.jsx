// Lesson progress, kept in this browser under the same key the original used.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import CURRICULUM from '../data/curriculum.js';

const LKEY = 'sthiti.learn.v1';
const LearnCtx = createContext(null);
export const useLearn = () => useContext(LearnCtx);

function load() {
  try { const saved = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (saved && saved.done) return saved; } catch (_) { /* private mode */ }
  return { done: {} };
}

export function allModules() { return CURRICULUM.reduce((a, st) => a.concat(st.modules.map((m) => ({ m, st }))), []); }
export function lessonNumber(id) { const all = allModules(); for (let i = 0; i < all.length; i++) if (all[i].m.id === id) return i + 1; return 0; }

export function LearnProvider({ children }) {
  const [learn, setLearn] = useState(load);
  const save = (next) => { try { localStorage.setItem(LKEY, JSON.stringify(next)); } catch (_) { /* private mode */ } };
  const toggle = useCallback((id) => setLearn((cur) => { const next = { done: { ...cur.done, [id]: !cur.done[id] } }; save(next); return next; }), []);
  const reset = useCallback(() => { const next = { done: {} }; save(next); setLearn(next); }, []);
  const value = useMemo(() => {
    const all = allModules();
    const doneCount = all.filter((x) => learn.done[x.m.id]).length;
    let nx = all[all.length - 1].m;
    for (let i = 0; i < all.length; i++) if (!learn.done[all[i].m.id]) { nx = all[i].m; break; }
    const label = doneCount ? 'Continue: lesson ' + lessonNumber(nx.id) : 'Start with lesson 1';
    return { done: learn.done, doneCount, total: all.length, next: nx, continueLabel: label, toggle, reset };
  }, [learn, toggle, reset]);
  return <LearnCtx.Provider value={value}>{children}</LearnCtx.Provider>;
}
