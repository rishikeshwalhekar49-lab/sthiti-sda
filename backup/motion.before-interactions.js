/* Sthiti · motion layer
 *
 * Presentation only. GSAP drives the tweens, Lenis the scrolling, and the named
 * effects below are vanilla ports of the React Bits components (CountUp,
 * SplitText, AnimatedContent, SpotlightCard, Marquee, ScrollProgress) — the
 * site has no React and no build step, and React Bits is a copy-in gallery
 * rather than a runtime dependency, so the effects come across directly.
 *
 * Nothing here reads or writes market state. Two contracts with app.js:
 *   · it listens for the `sthiti:live` event to fill the ticker,
 *   · it exposes window.Motion.scrollTo() so the router scrolls through Lenis.
 * If this file fails to load, or the reader prefers reduced motion, the CSS
 * hidden states never switch on and the site renders exactly as before.
 */
(function () {
  'use strict';

  var gsap = window.gsap, ST = window.ScrollTrigger, Lenis = window.Lenis;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var live = !!(gsap && ST && Lenis) && !reduced;

  /* No libraries, or motion declined: hand the router a native fallback and stop. */
  if (!live) {
    window.Motion = {
      active: false,
      scrollTo: function (t) {
        if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
      },
      refresh: function () { },
    };
    return;
  }

  gsap.registerPlugin(ST);
  var root = document.documentElement;
  root.classList.add('motion-on');

  var EASE = 'power3.out';
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ================= Lenis: smooth scroll ================= */

  var lenis = new Lenis({
    duration: 1.05,
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  /* One clock for both libraries, so a tween and the scroll never tear. */
  lenis.on('scroll', ST.update);
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  window.Motion = {
    active: true,
    scrollTo: function (target) {
      if (target) lenis.scrollTo(target, { offset: -84, duration: 0.9 });
      else lenis.scrollTo(0, { immediate: true });
    },
    refresh: function () { lenis.resize(); ST.refresh(); },
  };

  /* ================= ScrollProgress ================= */

  var prog = document.createElement('div');
  prog.className = 'mo-progress';
  prog.setAttribute('aria-hidden', 'true');
  document.body.appendChild(prog);
  gsap.to(prog, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  });

  /* ================= AnimatedContent: scroll reveals ================= */

  /* Tag rather than hand-edit 1,100 lines of markup: the hidden state is a
   * class this file adds, so it can never strand content if the file is gone. */
  function prep(els) {
    return els.filter(function (el) {
      if (!el || el.dataset.moReveal) return false;
      el.dataset.moReveal = '1';
      return true;
    });
  }

  function seq(trigger, els, opts) {
    els = prep(els);
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: (opts && opts.y) || 18 });
    /* `amount` spreads the whole stagger over a fixed span rather than paying
       per item, so a 16-card grid does not crawl in behind the reader. */
    var each = (opts && opts.stagger) || 0.07;
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.62,
      ease: EASE,
      stagger: { amount: Math.min(each * els.length, 0.5) },
      scrollTrigger: {
        trigger: trigger,
        start: (opts && opts.start) || 'top 82%',
        once: true,
      },
    });
  }

  var GROUPS = '.layers, .pairs, .feat-grid, .stage-cards, .cards, .gap-grid, .cand-grid, .pillars, .bridge-rows';

  /* A section reads label → heading → intro → its grid, in that order. */
  function revealSection(sec) {
    var items = [];
    var label = sec.querySelector(':scope > .sec-label');
    if (label) items.push(label);
    /* .sec-label is itself a div and comes first, so skip past it. */
    var body = sec.querySelector(':scope > div:not(.sec-label)') || sec;
    all(':scope > h2, :scope > h3, :scope > p.intro, :scope > p.lede', body).forEach(function (el) { items.push(el); });
    var grids = all(GROUPS, body);
    if (grids.length) {
      grids.forEach(function (g) { all(':scope > *', g).forEach(function (c) { items.push(c); }); });
    } else {
      all(':scope > *', body).forEach(function (el) {
        if (items.indexOf(el) < 0 && !el.matches('h2, h3, p.intro, p.lede')) items.push(el);
      });
    }
    seq(sec, items);
  }

  function revealTool(tool) {
    var items = [];
    ['.tool-head', '.tool-plain', '.tool-intro', '.panel'].forEach(function (sel) {
      var el = tool.querySelector(sel);
      if (el) items.push(el);
    });
    seq(tool, items, { stagger: 0.08 });
  }

  /* ================= SplitText: the hero headline ================= */

  function splitWords(el) {
    if (!el || el.dataset.moSplit) return [];
    var text = el.textContent;
    el.dataset.moSplit = '1';
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var out = [];
    text.split(/(\s+)/).forEach(function (chunk) {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
      var mask = document.createElement('span');
      mask.className = 'mo-word';
      var inner = document.createElement('span');
      inner.className = 'mo-word-in';
      inner.textContent = chunk;
      mask.appendChild(inner);
      frag.appendChild(mask);
      out.push(inner);
    });
    el.appendChild(frag);
    return out;
  }

  function heroIn() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var h1 = hero.querySelector('h1');
    var words = splitWords(h1);
    var rest = prep([
      hero.querySelector('.eyebrow'),
      hero.querySelector('.lede'),
      hero.querySelector('.cta-row'),
      hero.querySelector('.name-note'),
      hero.querySelector('.state'),
    ].filter(Boolean));

    var tl = gsap.timeline({ delay: 0.08 });
    if (words.length) {
      gsap.set(words, { yPercent: 108 });
      tl.to(words, { yPercent: 0, duration: 0.78, ease: 'power4.out', stagger: 0.045 });
    }
    if (rest.length) {
      gsap.set(rest, { opacity: 0, y: 16 });
      tl.to(rest, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.075 }, words.length ? 0.22 : 0);
    }

    /* The weather card sits above the hero and is the first thing read. */
    var w = document.querySelector('.weather-wrap');
    if (w && !w.dataset.moReveal) {
      w.dataset.moReveal = '1';
      gsap.from(w, { opacity: 0, y: -10, duration: 0.5, ease: EASE });
    }
  }

  /* ================= CountUp, plus a flash on later updates ================= */

  var NUM = /-?−?₹?\s?[\d,]*\d(?:\.\d+)?/;

  function fmtLike(sample, value) {
    var dec = (sample.split('.')[1] || '').length;
    var body = sample.indexOf(',') >= 0
      ? Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : Math.abs(value).toFixed(dec);
    return (value < 0 ? '−' : '') + body;
  }

  /* Animates the first number in the element and restores the exact markup
   * app.js wrote on completion, so no displayed value is ever invented. */
  function countUp(el) {
    var finalHtml = el.innerHTML;
    var m = el.textContent.match(NUM);
    if (!m) return;
    var token = m[0];
    var digits = token.replace(/[^\d.]/g, '');
    var target = parseFloat(digits);
    if (!isFinite(target) || !digits) return;
    var neg = /[-−]/.test(token);
    if (neg) target = -target;
    var prefix = el.textContent.slice(0, m.index);
    var suffix = el.textContent.slice(m.index + token.length);
    var sample = token.replace(/[^\d.,]/g, '');
    var currency = token.indexOf('₹') >= 0 ? (neg ? '−₹' : '₹') : '';

    var state = { v: target * (Math.abs(target) > 0 ? 0.82 : 0) };
    el.dataset.moBusy = '1';
    gsap.to(state, {
      v: target,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: function () {
        el.textContent = prefix.replace(/[₹\-−\s]*$/, '') + currency + fmtLike(sample, state.v).replace(/^−/, currency ? '' : '−') + suffix;
      },
      onComplete: function () {
        delete el.dataset.moBusy;
        el.innerHTML = finalHtml;
      },
    });
  }

  function flash(el) {
    gsap.fromTo(el, { backgroundColor: 'var(--h0-wash)' }, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.9, ease: 'power2.out', clearProps: 'backgroundColor' });
  }

  function watchCounters() {
    all('[data-countup]').forEach(function (el) {
      var obs = new MutationObserver(function () {
        if (el.dataset.moBusy) return;
        var txt = el.textContent.trim();
        if (!txt || txt === '—') return;
        if (el.dataset.moCounted) { flash(el); return; }
        el.dataset.moCounted = '1';
        countUp(el);
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* Bars arrive as SVG rects with a final width; grow them from nothing once. */
  function watchBars() {
    var svg = $('hsBars');
    if (!svg) return;
    var obs = new MutationObserver(function () {
      if (svg.dataset.moDrawn) return;
      var rects = all('rect', svg);
      if (!rects.length) return;
      svg.dataset.moDrawn = '1';
      rects.forEach(function (r) {
        var w = r.getAttribute('width');
        gsap.fromTo(r, { attr: { width: 0 } }, { attr: { width: w }, duration: 0.7, ease: EASE, delay: 0.05 * all('rect', svg).indexOf(r) });
      });
    });
    obs.observe(svg, { childList: true });
  }

  /* ================= SpotlightCard ================= */

  var SPOT = '.layer, .feat, .stage-card, .cand, .gap, .weather';

  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest(SPOT);
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    card.classList.add('mo-spot');
  }, { passive: true });

  document.addEventListener('pointerleave', function (e) {
    var card = e.target.closest && e.target.closest(SPOT);
    if (card) card.classList.remove('mo-spot');
  }, true);

  /* ================= Marquee: the index ticker ================= */

  function tickerCell(name, q) {
    var pct = typeof q.pct === 'number' ? q.pct : null;
    var cls = pct === null ? '' : pct >= 0 ? 'pos' : 'neg';
    var val = typeof q.last === 'number' ? q.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    var sign = pct === null ? '' : (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';
    return '<span class="mo-cell"><span class="mo-cell-n">' + name + '</span><span class="mo-cell-v">' + val + '</span>'
      + (sign ? '<span class="mo-cell-p ' + cls + '">' + sign + '</span>' : '') + '</span>';
  }

  var tickerTween = null;

  function buildTicker(body) {
    var host = $('ticker');
    if (!host || !body || !body.indices) return;
    var order = ['NIFTY 50', 'NIFTY BANK', 'NIFTY 500', 'INDIA VIX', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY PHARMA', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 'NIFTY ENERGY'];
    var cells = order
      .filter(function (k) { return body.indices[k]; })
      .map(function (k) { return tickerCell(k.replace(/^NIFTY /, '').replace('INDIA VIX', 'INDIA VIX'), body.indices[k]); });
    if (cells.length < 3) return;

    var run = cells.join('');
    host.hidden = false;
    host.innerHTML = '<div class="mo-track"><div class="mo-run">' + run + '</div><div class="mo-run" aria-hidden="true">' + run + '</div></div>';

    var trackRun = host.querySelector('.mo-run');
    var width = trackRun.getBoundingClientRect().width;
    if (tickerTween) tickerTween.kill();
    if (!width) return;
    tickerTween = gsap.fromTo(host.querySelector('.mo-track'),
      { x: 0 },
      { x: -width, duration: width / 42, ease: 'none', repeat: -1 });

    host.onpointerenter = function () { if (tickerTween) tickerTween.timeScale(0.15); };
    host.onpointerleave = function () { if (tickerTween) tickerTween.timeScale(1); };
  }

  window.addEventListener('sthiti:live', function (e) { buildTicker(e.detail); });

  /* ================= route changes ================= */

  /* Pages are toggled with [hidden], so the document height jumps and every
   * trigger position is stale; reveal whatever is now on screen and re-measure. */
  function enterPage() {
    var page = document.querySelector('[data-page]:not([hidden])');
    if (!page) return;
    if (!page.dataset.moEntered) {
      page.dataset.moEntered = '1';
      all('.sec', page).forEach(revealSection);
      all('.tool', page).forEach(revealTool);
      if (page.dataset.page === 'home') heroIn();
      else {
        var head = page.querySelector('.hero, .page-head');
        if (head) {
          var items = prep(all(':scope > *, .hero-grid > *', head));
          if (items.length) {
            gsap.set(items, { opacity: 0, y: 16 });
            gsap.to(items, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.07 });
          }
        }
      }
    }
    gsap.fromTo(page, { opacity: 0.55 }, { opacity: 1, duration: 0.32, ease: 'power2.out' });
    requestAnimationFrame(function () { lenis.resize(); ST.refresh(); });
  }

  window.addEventListener('hashchange', function () { requestAnimationFrame(enterPage); });

  /* ================= failsafe ================= */

  /* Every reveal starts from opacity 0, so the one unacceptable outcome is a
   * tween that never runs: requestAnimationFrame is paused in a background tab
   * and in some embedded contexts, and GSAP's ticker goes with it. Wall-clock
   * time keeps running, so if the ticker has not advanced a single frame by
   * then, drop the motion styles and show the page as plain HTML. */
  setTimeout(function () {
    if (gsap.ticker.frame > 0) return;
    root.classList.add('mo-settled');
    if (tickerTween) tickerTween.kill();
  }, 2200);

  /* ================= start ================= */

  watchCounters();
  watchBars();
  enterPage();
  window.addEventListener('load', function () { requestAnimationFrame(function () { lenis.resize(); ST.refresh(); }); });
})();
