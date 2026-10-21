// The motion layer: Lenis smooth scrolling on GSAP's clock, press ripples, tab transitions,
// and the failsafe that shows plain content if animation never starts. React port of
// the original public/motion.js. Everything here is presentation only.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = typeof window !== 'undefined' && !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const root = typeof document !== 'undefined' ? document.documentElement : null;

/* Animate only when GSAP's clock is demonstrably running; otherwise jump to the end state. */
export function animOK() { return !reducedMotion && !root.classList.contains('mo-settled') && gsap.ticker.frame > 0; }
export const motionActive = !reducedMotion;

const MotionCtx = createContext({ active: false, settled: false, scrollTo: () => {}, refresh: () => {} });
export const useMotion = () => useContext(MotionCtx);

const PRESS = '.btn, .chipbtn, .opt, .play, .nav a, .brand, button, summary, .layer, .feat, .stage-card, .cand, .weather, .state-row';
function pressScale(el) {
  if (el.matches('summary')) return 0.995;
  if (el.matches('.layer, .feat, .stage-card, .cand, .weather, .state-row')) return 0.985;
  if (el.matches('.nav a, .brand')) return 0.94;
  return 0.95;
}
function ripple(host, x, y) {
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  let ink = host.querySelector(':scope > .mo-ink');
  if (!ink) {
    ink = document.createElement('span');
    ink.className = 'mo-ink';
    ink.setAttribute('aria-hidden', 'true');
    host.appendChild(ink);
  }
  const r = host.getBoundingClientRect();
  const size = 2 * Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y));
  const dot = document.createElement('span');
  dot.className = 'mo-ink-dot';
  dot.style.width = dot.style.height = size + 'px';
  dot.style.left = (x - r.left - size / 2) + 'px';
  dot.style.top = (y - r.top - size / 2) + 'px';
  ink.appendChild(dot);
  gsap.fromTo(dot, { scale: 0, opacity: 0.3 }, { scale: 1, opacity: 0, duration: 0.65, ease: 'power2.out', onComplete: () => dot.remove() });
}

function pageOf(hash) {
  const h = decodeURIComponent((hash || '').replace(/^#\/?/, '')), first = h.split('/')[0];
  if (!first) return 'home';
  if (document.querySelector('[data-page="' + first + '"]')) return first;
  const el = document.getElementById(first), pg = el && el.closest('[data-page]');
  return pg ? pg.dataset.page : 'home';
}

export function MotionProvider({ children }) {
  const lenisRef = useRef(null);
  const [settled, setSettled] = useState(reducedMotion);   // true once animation is known not to run

  useLayoutEffect(() => {
    if (reducedMotion) return undefined;
    root.classList.add('motion-on');
    const lenis = new Lenis({ duration: 1.05, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, touchMultiplier: 1.6 });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    /* every reveal starts hidden, so a clock that never starts must not strand content */
    const failsafe = setTimeout(() => { if (gsap.ticker.frame === 0) { root.classList.add('mo-settled'); setSettled(true); } }, 2200);

    /* touch: sink on press, spring back, ink ripple from the touch point */
    let pressed = null;
    const down = (e) => {
      if (e.button > 0 || !animOK()) return;
      const host = e.target.closest && e.target.closest(PRESS);
      if (!host || host.disabled) return;
      pressed = host;
      gsap.to(host, { scale: pressScale(host), duration: 0.12, ease: 'power2.out', overwrite: 'auto' });
      ripple(host, e.clientX, e.clientY);
    };
    const release = () => {
      if (!pressed) return;
      gsap.to(pressed, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.45)', overwrite: 'auto', clearProps: 'transform' });
      pressed = null;
    };
    const keyClick = (e) => {
      if (e.detail !== 0 || !animOK()) return;
      const host = e.target.closest && e.target.closest(PRESS);
      if (!host) return;
      const r = host.getBoundingClientRect();
      ripple(host, r.left + r.width / 2, r.top + r.height / 2);
    };

    /* tabs: play the current page out before navigating to another one */
    let leaving = false;
    const navigate = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.target) return;
      const href = a.getAttribute('href');
      const cur = document.querySelector('[data-page]:not([hidden])');
      if (!cur || href === location.hash || pageOf(href) === cur.dataset.page || !animOK()) return;
      e.preventDefault();
      if (leaving) return;
      leaving = true;
      const go = () => { if (!leaving) return; leaving = false; location.hash = href; };
      gsap.to(cur, { opacity: 0, y: -10, duration: 0.2, ease: 'power2.in', onComplete: go });
      setTimeout(go, 360);   // never let a stalled clock hold navigation hostage
    };

    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('click', keyClick, true);
    document.addEventListener('click', navigate);
    return () => {
      clearTimeout(failsafe);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      document.removeEventListener('click', keyClick, true);
      document.removeEventListener('click', navigate);
      root.classList.remove('motion-on');
    };
  }, []);

  const value = useMemo(() => ({
    active: !reducedMotion,
    settled,
    scrollTo(target) {
      const lenis = lenisRef.current;
      if (lenis) {
        // Lenis 1.3 subtracts the target's scroll-margin-top; the original's 1.1 did not, so add it back
        if (target) lenis.scrollTo(target, { offset: -84 + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0), duration: 0.9 });
        else lenis.scrollTo(0, { immediate: true });
        return;
      }
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    },
    refresh() { if (lenisRef.current) lenisRef.current.resize(); ScrollTrigger.refresh(); },
    lenis: () => lenisRef.current,
  }), [settled]);

  useEffect(() => { window.Motion = value; }, [value]);
  return <MotionCtx.Provider value={value}>{children}</MotionCtx.Provider>;
}

/* ScrollProgress: a hairline under the status bar */
export function ScrollProgress() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (reducedMotion) return undefined;
    const t = gsap.to(ref.current, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
    return () => { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); };
  }, []);
  if (reducedMotion) return null;
  return <div className="mo-progress" aria-hidden="true" ref={ref} />;
}

/* the underline that travels between tabs: stretches across both, then contracts onto the new one */
export function NavInk({ navRef, page }) {
  const ref = useRef(null);
  const at = useRef(null);
  useLayoutEffect(() => {
    const ink = ref.current, nav = navRef.current;
    if (!ink || !nav) return undefined;
    const place = (instant) => {
      const a = nav.querySelector('a[aria-current="page"]');
      if (!a) { gsap.set(ink, { opacity: 0 }); at.current = null; return; }
      const to = { x: a.offsetLeft, w: a.offsetWidth };
      if (instant || !at.current || !animOK()) {
        gsap.killTweensOf(ink);
        gsap.set(ink, { x: to.x, width: to.w, opacity: 1 });
        at.current = to;
        return;
      }
      const from = at.current;
      at.current = to;
      if (from.x === to.x && from.w === to.w) return;
      const left = Math.min(from.x, to.x), right = Math.max(from.x + from.w, to.x + to.w);
      gsap.killTweensOf(ink);
      gsap.timeline()
        .to(ink, { x: left, width: right - left, opacity: 1, duration: 0.18, ease: 'power2.in' })
        .to(ink, { x: to.x, width: to.w, duration: 0.5, ease: 'expo.out' });
    };
    place(!at.current);
    const onResize = () => place(true);
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(true));
    return () => window.removeEventListener('resize', onResize);
  }, [page, navRef]);
  if (reducedMotion) return null;
  return <span className="mo-nav-ink" aria-hidden="true" ref={ref} />;
}
