// Small pieces shared across pages, matching the original markup exactly.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PILL } from '../lib/format.js';

/* <span class="src [live]">text</span> — the original srcLine() */
export function Src({ id, text, live, initial = '—' }) {
  return <span className={'src' + (live ? ' live' : '')} id={id}>{text == null ? initial : text}</span>;
}

/* the original pill(st, label) */
export function Pill({ st, label }) {
  return <span className={'pill ' + st}>{label || PILL[st]}</span>;
}

/* width of an element, kept current with ResizeObserver (the original onResize) */
export function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (!window.ResizeObserver) {
      const on = () => setW(el.clientWidth);
      window.addEventListener('resize', on);
      return () => window.removeEventListener('resize', on);
    }
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* <div class="tip" hidden> positioned next to the pointer inside a host (the original placeTip) */
export function useTip(hostRef) {
  const tipRef = useRef(null);
  const [tip, setTip] = useState(null);   // { html: ReactNode, x, y } or null
  useEffect(() => {
    const el = tipRef.current, host = hostRef.current;
    if (!tip || !el || !host) return;
    const hr = host.getBoundingClientRect();
    let x = tip.x - hr.left + 14, y = tip.y - hr.top + 14;
    const tw = el.offsetWidth, th = el.offsetHeight;
    if (x + tw > hr.width - 4) x = tip.x - hr.left - tw - 14;
    if (y + th > hr.height) y = tip.y - hr.top - th - 12;
    el.style.transform = 'translate(' + Math.max(0, x) + 'px,' + Math.max(0, y) + 'px)';
  }, [tip, hostRef]);
  return { tipRef, tip, show: (content, ev) => setTip({ content, x: ev.clientX, y: ev.clientY }), hide: () => setTip(null) };
}
export function Tip({ id, t }) {
  return <div className="tip" id={id} ref={t.tipRef} hidden={!t.tip}>{t.tip ? t.tip.content : null}</div>;
}

/* the original esc() + "**x**" -> <strong>x</strong> */
export function boldMarkdown(text) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
}
