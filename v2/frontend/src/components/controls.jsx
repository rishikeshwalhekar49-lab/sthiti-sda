// The interactive controls, as React components: an animated listbox in place of the OS
// <select> popup, a range slider with a filled track and a readout bubble, and a <details>
// that opens and closes smoothly. Each falls back to the plain native control when the
// reader prefers reduced motion.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { animOK, motionActive, useMotion } from '../motion/MotionProvider.jsx';

/* ---------------- Dropdown ---------------- */
export function Dropdown(props) {
  return motionActive ? <AnimatedDropdown {...props} /> : <NativeSelect {...props} />;
}

function NativeSelect({ id, value, options, onChange, variant = 'pick' }) {
  return (
    <select className={variant === 'pick' ? 'pick-sel' : undefined} id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function AnimatedDropdown({ id, value, options, onChange, variant = 'pick' }) {
  const { lenis } = useMotion();
  const [open, setOpen] = useState(false);      // logically open
  const [shown, setShown] = useState(false);    // list in the DOM (stays while it animates out)
  const [active, setActive] = useState(0);
  const upRef = useRef(false);
  const btn = useRef(null), list = useRef(null), hl = useRef(null), chev = useRef(null), val = useRef(null);
  const listId = useId().replace(/:/g, '') + '-list';
  const typed = useRef({ s: '', at: 0 });
  const scrollAt = useRef(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];

  const close = useCallback((instant, refocus) => {
    setOpen(false);
    const L = list.current;
    if (instant || !animOK() || !L) { gsap.set(chev.current, { rotate: 0 }); setShown(false); }
    else {
      gsap.to(L, { opacity: 0, y: upRef.current ? 6 : -6, scaleY: 0.96, duration: 0.15, ease: 'power2.in', overwrite: true, onComplete: () => setShown(false) });
      gsap.to(chev.current, { rotate: 0, duration: 0.28, ease: 'power3.out' });
    }
    if (refocus && btn.current) btn.current.focus();
  }, []);

  const choose = (i) => {
    const o = options[i];
    if (!o) return;
    close(false, true);
    if (o.value === value) return;
    if (animOK() && val.current) gsap.fromTo(val.current, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity' });
    onChange(o.value);
  };

  const openList = () => {
    setActive(index);
    const l = lenis && lenis();
    scrollAt.current = l ? l.scroll : window.scrollY;
    setShown(true);
    setOpen(true);
  };

  useLayoutEffect(() => {      // place and animate the list once it is in the DOM
    if (!open || !list.current || !btn.current) return;
    const L = list.current, r = btn.current.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    L.style.minWidth = Math.max(r.width, 180) + 'px';
    L.style.maxWidth = Math.min(460, vw - 16) + 'px';
    const h = Math.min(L.scrollHeight, 300);
    const flip = (vh - r.bottom < h + 14) && (r.top > vh - r.bottom);
    upRef.current = flip;
    L.style.left = Math.max(8, Math.min(r.left, vw - L.offsetWidth - 8)) + 'px';
    L.style.top = (flip ? r.top - h - 6 : r.bottom + 6) + 'px';
    const opts = L.querySelectorAll('[role=option]');
    const sel = opts[index];
    if (sel) L.scrollTop = sel.offsetTop - L.clientHeight / 2 + sel.offsetHeight / 2;
    if (animOK()) {
      gsap.fromTo(L, { opacity: 0, y: flip ? 8 : -8, scaleY: 0.92, transformOrigin: flip ? '50% 100%' : '50% 0%' },
        { opacity: 1, y: 0, scaleY: 1, duration: 0.26, ease: 'power3.out', overwrite: true });
      gsap.fromTo(opts, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out', delay: 0.05, stagger: { amount: Math.min(0.03 * opts.length, 0.2) }, overwrite: true });
      gsap.to(chev.current, { rotate: 180, duration: 0.32, ease: 'back.out(2)' });
    } else {
      gsap.set(L, { opacity: 1, y: 0, scaleY: 1 }); gsap.set(opts, { opacity: 1, x: 0 }); gsap.set(chev.current, { rotate: 180 });
    }
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {      // the highlight pill slides to the active option
    if (!open || !list.current || !hl.current) return;
    const o = list.current.querySelectorAll('[role=option]')[active];
    if (!o) return;
    const to = { y: o.offsetTop, height: o.offsetHeight, opacity: 1 };
    if (!animOK()) gsap.set(hl.current, to);
    else gsap.to(hl.current, { ...to, duration: 0.22, ease: 'power3.out', overwrite: true });
    const L = list.current;
    if (o.offsetTop < L.scrollTop) L.scrollTop = o.offsetTop - 4;
    else if (o.offsetTop + o.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = o.offsetTop + o.offsetHeight - L.clientHeight + 4;
  }, [active, open]);

  useEffect(() => {            // outside press, scrolling away, resizing or navigating closes it
    if (!open) return undefined;
    const outside = (e) => { if (!btn.current.contains(e.target) && !(list.current && list.current.contains(e.target))) close(false); };
    const l = lenis && lenis();
    const onScroll = () => { const y = l ? l.scroll : window.scrollY; if (Math.abs(y - scrollAt.current) > 6) close(false); };
    const instant = () => close(true);
    document.addEventListener('pointerdown', outside, true);
    if (l) l.on('scroll', onScroll); else window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', instant);
    window.addEventListener('hashchange', instant);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      if (l) l.off('scroll', onScroll); else window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', instant);
      window.removeEventListener('hashchange', instant);
    };
  }, [open, close, lenis]);

  const onKey = (e) => {
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openList(); }
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); }
    else if (k === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
    else if (k === 'Escape') { e.preventDefault(); close(false, true); }
    else if (k === 'Tab') { close(true); }
    else if (k.length === 1 && /\S/.test(k)) {
      const now = Date.now(), t = typed.current;
      t.s = (now - t.at > 700 ? '' : t.s) + k.toLowerCase(); t.at = now;
      const n = options.length, startAt = t.s.length > 1 ? active : active + 1;
      for (let j = 0; j < n; j++) { const i = (startAt + j + n) % n; if (options[i].label.trim().toLowerCase().indexOf(t.s) === 0) { setActive(i); break; } }
    }
  };

  return (
    <span className={'mo-dd mo-dd--' + variant + (open ? ' is-open' : '')}>
      <button type="button" className="mo-dd-btn" id={id} ref={btn} role="combobox" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={listId} aria-activedescendant={open ? listId + '-o' + active : undefined}
        onClick={() => (open ? close(false) : openList())} onKeyDown={onKey}>
        <span className="mo-dd-val" ref={val}>{current ? current.label : '—'}</span>
        <svg className="mo-dd-chev" ref={chev} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {shown && createPortal(
        <div className="mo-dd-list" id={listId} role="listbox" data-lenis-prevent="" ref={list} onMouseDown={(e) => e.preventDefault()}>
          <span className="mo-dd-hl" aria-hidden="true" ref={hl} />
          {options.map((o, i) => (
            <div key={o.value} className={'mo-dd-opt' + (i === active ? ' is-active' : '')} id={listId + '-o' + i} role="option"
              aria-selected={i === index} onPointerMove={() => i !== active && setActive(i)} onClick={() => choose(i)}>
              <span className="mo-dd-check" aria-hidden="true">✓</span><span className="mo-dd-txt">{o.label}</span>
            </div>
          ))}
        </div>, document.body)}
    </span>
  );
}

/* ---------------- Slider ---------------- */
const THUMB = 18;
export function Slider({ id, min, max, step, value, onInput, bubble }) {
  const ref = useRef(null), bub = useRef(null);
  const [drag, setDrag] = useState(false);
  const idle = useRef(0);
  const frac = Math.max(0, Math.min(1, max > min ? (value - min) / (max - min) : 0));

  useLayoutEffect(() => {      // keep the bubble over the thumb
    const inp = ref.current, b = bub.current;
    if (!inp || !b) return;
    b.style.left = (inp.offsetLeft + THUMB / 2 + frac * (inp.offsetWidth - THUMB)) + 'px';
    b.style.top = (inp.offsetTop - 4) + 'px';
  });
  useLayoutEffect(() => { if (bub.current) gsap.set(bub.current, { xPercent: -50, yPercent: -100, opacity: 0, scale: 0.6, y: 6, transformOrigin: '50% 100%' }); }, []);

  const show = () => { if (!bub.current) return; if (animOK()) gsap.to(bub.current, { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: 'back.out(2.4)', overwrite: true }); else gsap.set(bub.current, { opacity: 1, scale: 1, y: 0 }); };
  const hide = () => { if (!bub.current) return; if (animOK()) gsap.to(bub.current, { opacity: 0, scale: 0.6, y: 6, duration: 0.2, ease: 'power2.in', overwrite: true }); else gsap.set(bub.current, { opacity: 0 }); };
  const tick = () => {
    const out = ref.current && ref.current.labels && ref.current.labels[0] ? ref.current.labels[0].querySelector('output') : null;
    if (!out || !animOK()) return;
    gsap.fromTo(out, { scale: 1.18, color: 'var(--h0-text)' }, { scale: 1, color: 'var(--ink)', duration: 0.4, ease: 'back.out(3)', overwrite: true, clearProps: 'transform,color' });
  };
  useEffect(() => {
    if (!drag) return undefined;
    const stop = () => { setDrag(false); hide(); };
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, [drag]);

  return (
    <>
      <input type="range" id={id} ref={ref} min={min} max={max} step={step} value={value}
        className={drag ? 'mo-drag' : undefined} style={motionActive ? { '--pct': (frac * 100).toFixed(2) + '%' } : undefined}
        onChange={(e) => {
          onInput(+e.target.value);
          tick();
          if (!drag) { show(); clearTimeout(idle.current); idle.current = setTimeout(hide, 900); }
        }}
        onPointerDown={() => { setDrag(true); clearTimeout(idle.current); show(); }}
        onBlur={() => { clearTimeout(idle.current); hide(); }} />
      {motionActive && <span className="mo-bubble" aria-hidden="true" ref={bub}>{bubble}</span>}
    </>
  );
}

/* ---------------- Details ---------------- */
/* A <details> that opens and closes smoothly; its <summary> is passed in as ordinary markup. */
function closedHeight(det, sum) {
  const cs = getComputedStyle(det);
  return sum.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
}
export function Details({ children, ...rest }) {
  const ref = useRef(null);
  const { refresh } = useMotion();
  const onClick = (e) => {
    const det = ref.current, sum = e.target.closest && e.target.closest('summary');
    if (!det || !sum || sum.parentNode !== det || !animOK()) return;   // otherwise the native toggle
    e.preventDefault();
    if (det.dataset.moAnim) return;
    det.dataset.moAnim = '1';
    const body = Array.from(det.children).filter((c) => c.tagName !== 'SUMMARY');
    const start = det.offsetHeight;
    const done = () => { gsap.set(det, { clearProps: 'height,overflow' }); delete det.dataset.moAnim; refresh(); };
    if (!det.open) {
      det.open = true;
      const end = det.offsetHeight;
      gsap.set(det, { height: start, overflow: 'hidden' });
      gsap.to(det, { height: end, duration: 0.46, ease: 'power3.out', onComplete: done });
      gsap.fromTo(body, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out', delay: 0.08, clearProps: 'opacity,transform' });
    } else {
      gsap.set(det, { height: start, overflow: 'hidden' });
      gsap.to(body, { opacity: 0, y: -4, duration: 0.18, ease: 'power1.in' });
      gsap.to(det, { height: closedHeight(det, sum), duration: 0.34, ease: 'power3.inOut', onComplete: () => { det.open = false; gsap.set(body, { clearProps: 'opacity,transform' }); done(); } });
    }
  };
  return <details ref={ref} onClick={onClick} {...rest}>{children}</details>;
}
