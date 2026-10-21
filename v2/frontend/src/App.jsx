// App shell: header, status bar, the four pages (kept mounted, as in the original, so each
// page keeps its state when you switch away), and the footer. Hash routing as before.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { DataProvider } from './state/DataContext.jsx';
import { EngineProvider } from './state/EngineContext.jsx';
import { LearnProvider } from './state/LearnContext.jsx';
import { MotionProvider, NavInk, ScrollProgress, animOK, useMotion } from './motion/MotionProvider.jsx';
import { PageCtx } from './motion/Reveal.jsx';
import StatusBar from './components/StatusBar.jsx';
import Home from './pages/Home.jsx';
import Learn from './pages/Learn.jsx';
import Tools from './pages/Tools.jsx';
import Engine from './pages/Engine.jsx';

const PAGES = ['home', 'learn', 'tools', 'engine'];

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')), parts = h.split('/');
  let page = 'home', target = null;
  if (PAGES.indexOf(parts[0]) >= 0) { page = parts[0]; if (parts[1]) target = parts[1]; }
  else if (parts[0]) {
    const el = document.getElementById(parts[0]), pg = el && el.closest('[data-page]');
    if (pg) { page = pg.dataset.page; target = parts[0]; }
  }
  return { page, target, key: location.hash };
}

// A page stays mounted while hidden; its scroll reveals arm the first time it is shown.
function Page({ name, current, entered, children }) {
  return (
    <PageCtx.Provider value={entered ? ENTERED : NOT_ENTERED}>
      <div className="page" data-page={name} hidden={current !== name}>{children}</div>
    </PageCtx.Provider>
  );
}
const ENTERED = { entered: true }, NOT_ENTERED = { entered: false };

function Shell() {
  const motion = useMotion();
  const [route, setRoute] = useState(parseHash);
  const [visited, setVisited] = useState(() => new Set([parseHash().page]));
  const navRef = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    const on = () => {
      const r = parseHash();
      setRoute(r);
      setVisited((v) => (v.has(r.page) ? v : new Set(v).add(r.page)));
    };
    window.addEventListener('hashchange', on);
    on();     // re-read now that every page's elements exist (deep links to lessons, tools…)
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useLayoutEffect(() => {
    const pageEl = document.querySelector('[data-page="' + route.page + '"]');
    document.querySelectorAll('[data-page][hidden]').forEach((p) => gsap.set(p, { clearProps: 'opacity,transform' }));
    if (!first.current && pageEl && animOK()) {
      gsap.fromTo(pageEl, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.48, ease: 'power3.out', clearProps: 'opacity,transform' });
    } else if (pageEl) gsap.set(pageEl, { clearProps: 'opacity,transform' });
    first.current = false;
    const target = route.target ? document.getElementById(route.target) : null;
    if (target) requestAnimationFrame(() => motion.scrollTo(target)); else motion.scrollTo(null);
    requestAnimationFrame(() => motion.refresh());
  }, [route, motion]);

  const page = route.page;
  const nav = [['home', 'Home'], ['learn', 'Learn'], ['tools', 'Tools'], ['engine', 'Regime engine']];
  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <a className="brand" href="#home" aria-label="Sthiti home">
            <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><rect x="0" y="1" width="18" height="3" rx="1.5" fill="var(--ink)" /><rect x="0" y="7.5" width="12" height="3" rx="1.5" fill="var(--h0)" /><rect x="6" y="14" width="9" height="3" rx="1.5" fill="var(--h1)" /></svg>
            Sthiti
          </a>
          <nav className="nav" aria-label="Pages" ref={navRef}>
            {nav.map(([r, label]) => <a key={r} href={'#' + r} data-route={r} aria-current={page === r ? 'page' : undefined}>{label}</a>)}
            <NavInk navRef={navRef} page={page} />
          </nav>
        </div>
      </header>
      <StatusBar />
      <ScrollProgress />
      <main>
        <Page name="home" current={page} entered={visited.has('home')}><Home /></Page>
        <Page name="learn" current={page} entered={visited.has('learn')}><Learn /></Page>
        <Page name="tools" current={page} entered={visited.has('tools')}><Tools /></Page>
        <Page name="engine" current={page} entered={visited.has('engine')}><Engine /></Page>
      </main>
      <footer>
        <div className="wrap">
          <p><b>Sthiti</b> · concept build, September 2026. Educational concept, not investment, legal or tax advice. Data read from NSE and BSE public endpoints for this demo; a product would need a licensed feed.</p>
          <nav aria-label="Footer"><a href="#home">Home</a><a href="#learn">Learn</a><a href="#tools">Tools</a><a href="#engine">Regime engine</a></nav>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <MotionProvider>
      <DataProvider>
        <EngineProvider>
          <LearnProvider>
            <Shell />
          </LearnProvider>
        </EngineProvider>
      </DataProvider>
    </MotionProvider>
  );
}
